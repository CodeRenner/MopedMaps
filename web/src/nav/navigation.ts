/**
 * Navigation mode: follows the GPS position along the route with a slim UI
 * (next turn on top, remaining distance/time/ETA and speed limit at the
 * bottom), keeps the screen on and reroutes when the rider leaves the route.
 * DOM/geolocation glue; the logic is in progress.ts / maneuvers.ts.
 */

import { type Map as MapLibreMap, Marker } from 'maplibre-gl';
import { NAV_MAX_PIXEL_RATIO, NAV_SNAP_M } from '../config';
import { formatNumber, getLocale, t } from '../i18n';
import { keepAboveAttribution } from '../ui/aboveAttribution';
import type { KeyValueStorage } from '../ui/profileStore';
import type { LatLon, RouteResult } from '../router/protocol';
import { type BandSection, bandsAhead, speedBands } from '../ui/speedBands';
import { FollowCamera } from './camera';
import { etaClock, navDistance, TURN_ARROW } from './format';
import { type Maneuver, maneuvers, nextManeuver } from './maneuvers';
import {
  bearingAt,
  buildTrack,
  type Fix,
  locate,
  OffRouteDetector,
  pointAt,
  type Progress,
  remainingGeometry,
  type RouteTrack,
} from './progress';
import { loadVoiceOn, saveVoiceOn, speak, speechAvailable, stopSpeaking } from './speech';
import { Announcer, type Speech } from './voice';

export interface NavigationDeps {
  map: MapLibreMap;
  /** Compute a new route from the current position to the destination. */
  reroute(from: LatLon): Promise<RouteResult | null>;
  /** Show a (new) route on the map. */
  showRoute(r: RouteResult, from: LatLon): void;
  /** Redraw the route line (navigation shows only the part still ahead). */
  drawRoute(geometry: LatLon[], bands: BandSection[]): void;
  /** Called after navigation ended (button or error). */
  onExit(): void;
  /** Where the voice on/off setting is stored. */
  storage: KeyValueStorage | null;
}

export interface Navigation {
  start(route: RouteResult): void;
  stop(): void;
  readonly active: boolean;
}

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

export function createNavigation(deps: NavigationDeps): Navigation {
  const top = document.createElement('div');
  top.className = 'nav-top';
  top.innerHTML = '<span class="nav-arrow"></span><span class="nav-text"></span>';
  const bottom = document.createElement('div');
  bottom.className = 'nav-bottom';
  bottom.innerHTML =
    '<span class="nav-limit" hidden></span><span class="nav-summary"></span><button type="button" class="nav-voice"></button><button type="button" class="nav-stop">✕</button>';
  const recenter = document.createElement('button');
  recenter.type = 'button';
  recenter.className = 'nav-recenter';
  recenter.textContent = '◎';
  recenter.hidden = true;
  const arrow = top.querySelector<HTMLElement>('.nav-arrow')!;
  const text = top.querySelector<HTMLElement>('.nav-text')!;
  const limitBadge = bottom.querySelector<HTMLElement>('.nav-limit')!;
  const summary = bottom.querySelector<HTMLElement>('.nav-summary')!;
  const stopBtn = bottom.querySelector<HTMLButtonElement>('.nav-stop')!;
  const voiceBtn = bottom.querySelector<HTMLButtonElement>('.nav-voice')!;
  let voiceOn = loadVoiceOn(deps.storage);
  const announcer = new Announcer();
  const renderVoice = () => {
    voiceBtn.hidden = !speechAvailable();
    voiceBtn.textContent = voiceOn ? '🔊' : '🔇';
    voiceBtn.setAttribute('aria-label', t(voiceOn ? 'voice.on' : 'voice.off'));
    voiceBtn.setAttribute('aria-pressed', String(voiceOn));
  };
  renderVoice();
  voiceBtn.addEventListener('click', () => {
    voiceOn = !voiceOn;
    saveVoiceOn(deps.storage, voiceOn);
    renderVoice();
    if (!voiceOn) stopSpeaking();
  });
  const say = (s: Speech) => {
    if (!voiceOn) return;
    const loc = getLocale();
    const turn = 'turn' in s ? t(`nav.turn.${s.turn}`) : '';
    const dist =
      'dist' in s
        ? s.dist < 1000
          ? t('voice.meters', { n: s.dist })
          : t('voice.km', { n: formatNumber(loc, s.dist / 1000, 1) })
        : '';
    speak(t(s.key, { dist, turn }));
  };
  stopBtn.setAttribute('aria-label', t('nav.stop'));
  recenter.setAttribute('aria-label', t('nav.recenter'));
  for (const el of [top, bottom, recenter]) {
    el.hidden = true;
    // Taps on the overlay must never reach the map.
    el.addEventListener('click', (ev) => ev.stopPropagation());
    document.body.append(el);
  }

  const placeBottom = keepAboveAttribution(bottom);
  const placeRecenter = keepAboveAttribution(recenter, 80);

  const dotEl = document.createElement('div');
  dotEl.className = 'nav-position';
  const dot = new Marker({ element: dotEl, rotationAlignment: 'map' });
  const camera = new FollowCamera(deps.map, (p) => dot.setLngLat([p.lon, p.lat]).addTo(deps.map));

  let active = false;
  let watchId: number | null = null;
  let route: RouteResult | null = null;
  let track: RouteTrack | null = null;
  let turns: Maneuver[] = [];
  let bands: BandSection[] = [];
  let alongM = 0;
  let drawnAlongM = -1;
  let lastFixTime = 0;
  let rerouting = false;
  let lastFix: Fix | null = null;
  let gpsBearing = 0;
  let wake: WakeLockSentinelLike | null = null;
  const offRoute = new OffRouteDetector();

  const setRoute = (r: RouteResult) => {
    route = r;
    track = buildTrack(r.geometry, r.profile);
    turns = maneuvers(track);
    bands = speedBands(r.geometry, r.profile);
    alongM = 0;
    drawnAlongM = -1;
    offRoute.reset();
  };

  const requestWakeLock = async () => {
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } })
        .wakeLock;
      wake = wl ? await wl.request('screen') : null;
    } catch {
      wake = null; // not supported or denied: the screen may turn off (iOS before 16.4)
    }
  };
  const onVisible = () => {
    if (active && document.visibilityState === 'visible') void requestWakeLock();
  };

  const render = (fix: Fix, speedMps = 0): Progress | null => {
    if (!track || !route) return null;
    const p = locate(track, fix, alongM);
    alongM = p.alongM;
    const loc = getLocale();
    if (p.arrived) {
      arrow.textContent = TURN_ARROW.arrive!;
      text.textContent = t('nav.arrived');
    } else {
      const m = nextManeuver(turns, p.alongM);
      arrow.textContent = TURN_ARROW[m.kind] ?? '↑';
      text.textContent = t('nav.next', { dist: navDistance(loc, m.atM - p.alongM), turn: t(`nav.turn.${m.kind}`) });
    }
    const m = nextManeuver(turns, p.alongM);
    const speech = announcer.update(m, m.atM - p.alongM, speedMps, p.arrived);
    if (speech) say(speech);
    const remainingS = route.timeS * p.remainingTimeShare;
    summary.textContent = t('nav.summary', {
      dist: navDistance(loc, p.remainingM),
      min: Math.max(1, Math.round(remainingS / 60)),
      eta: etaClock(new Date(), remainingS),
    });
    const limit = route.profile.limitKmh[p.edge];
    limitBadge.hidden = limit === undefined;
    limitBadge.textContent = limit === undefined ? '' : String(limit);
    limitBadge.title = limit === undefined ? '' : t('nav.limit', { kmh: limit });
    if (!p.arrived && offRoute.update(p, fix) && !rerouting) void doReroute(fix);
    return p;
  };

  /** Hide the part already ridden (redrawn every few metres, not every fix). */
  const trimRoute = (along: number) => {
    if (!track || Math.abs(along - drawnAlongM) < 5) return;
    drawnAlongM = along;
    const { seg, point } = pointAt(track, along);
    deps.drawRoute(remainingGeometry(track, along), bandsAhead(bands, seg, point));
  };

  /**
   * Camera target: on the route, the position predicted for the next fix
   * (snapped to the route, heading along the road), so the camera glides with
   * the rider; off the route the raw GPS position and heading.
   */
  const follow = (fix: Fix, p: Progress | null, speedMps: number, dtMs: number) => {
    if (track && p && p.offsetM <= NAV_SNAP_M) {
      const ahead = p.arrived ? p.alongM : p.alongM + (speedMps * dtMs) / 1000;
      const { point } = pointAt(track, ahead);
      camera.moveTo({ lat: point[0], lon: point[1], bearing: bearingAt(track, ahead) }, dtMs);
    } else {
      camera.moveTo({ lat: fix.lat, lon: fix.lon, bearing: gpsBearing }, dtMs);
    }
  };

  const doReroute = async (fix: Fix) => {
    rerouting = true;
    text.textContent = t('nav.rerouting');
    try {
      const r = await deps.reroute([fix.lat, fix.lon]);
      if (r && active) {
        setRoute(r);
        deps.showRoute(r, [fix.lat, fix.lon]);
        announcer.reset();
        say({ key: 'voice.rerouted' });
      }
    } finally {
      rerouting = false;
    }
  };

  const onFix = (pos: GeolocationPosition) => {
    const fix: Fix = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy ?? 0 };
    // Heading: from the device when moving, else from the last fix if we moved a bit.
    const h = pos.coords.heading;
    if (h !== null && h !== undefined && !Number.isNaN(h) && (pos.coords.speed ?? 0) > 2) gpsBearing = h;
    else if (lastFix) {
      const dy = fix.lat - lastFix.lat;
      const dx = (fix.lon - lastFix.lon) * Math.cos((fix.lat * Math.PI) / 180);
      if (Math.hypot(dx, dy) * 111_195 > 8) gpsBearing = (Math.atan2(dx, dy) * 180) / Math.PI;
    }
    lastFix = fix;
    const now = performance.now();
    // Glide over the fix interval (typically ~1 s), clamped for missed or bunched fixes.
    const dtMs = lastFixTime ? Math.min(2000, Math.max(300, now - lastFixTime)) : 1000;
    lastFixTime = now;
    const speed = Math.max(0, pos.coords.speed ?? 0);
    const p = render(fix, speed);
    if (p) trimRoute(p.alongM);
    follow(fix, p, speed, dtMs);
  };

  const onError = (err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) {
      text.textContent = t('nav.noGps');
      arrow.textContent = '⚠';
    }
  };

  // Pause following when the rider pans the map; ◎ resumes.
  deps.map.on('dragstart', (ev: { originalEvent?: unknown }) => {
    if (!active || !ev.originalEvent) return;
    camera.paused = true;
    recenter.hidden = false;
  });
  recenter.addEventListener('click', () => {
    recenter.hidden = true;
    camera.recenter();
  });
  stopBtn.addEventListener('click', () => nav.stop());

  const nav: Navigation = {
    get active() {
      return active;
    },
    start(r) {
      if (active) return;
      active = true;
      setRoute(r);
      lastFix = null;
      lastFixTime = 0;
      camera.attach();
      // Fewer pixels to draw per frame on 3x screens (battery); restored on stop.
      deps.map.setPixelRatio(Math.min(window.devicePixelRatio || 1, NAV_MAX_PIXEL_RATIO));
      document.body.classList.add('nav-mode');
      top.hidden = bottom.hidden = false;
      recenter.hidden = true;
      placeBottom();
      placeRecenter();
      arrow.textContent = '…';
      text.textContent = t('nav.waitingGps');
      summary.textContent = '';
      limitBadge.hidden = true;
      void requestWakeLock();
      document.addEventListener('visibilitychange', onVisible);
      // Speak once inside the tap that started navigation: iOS only allows speech after a user gesture.
      renderVoice();
      announcer.restart();
      say({ key: 'voice.start' });
      watchId = navigator.geolocation?.watchPosition(onFix, onError, {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 20_000,
      }) ?? null;
      if (watchId === null) text.textContent = t('nav.noGps');
    },
    stop() {
      if (!active) return;
      active = false;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
      void wake?.release().catch(() => undefined);
      wake = null;
      document.removeEventListener('visibilitychange', onVisible);
      stopSpeaking();
      document.body.classList.remove('nav-mode');
      top.hidden = bottom.hidden = recenter.hidden = true;
      dot.remove();
      camera.release();
      deps.map.setPixelRatio(window.devicePixelRatio || 1);
      if (route) deps.drawRoute(route.geometry, bands); // whole route again
      deps.map.easeTo({ bearing: 0, duration: 400 });
      deps.onExit();
    },
  };
  return nav;
}
