/**
 * Navigation mode: follows the GPS position along the route with a slim UI
 * (next turn on top, remaining distance/time/ETA and speed limit at the
 * bottom), keeps the screen on and reroutes when the rider leaves the route.
 * DOM/geolocation glue; the logic is in progress.ts / maneuvers.ts.
 */

import { type Map as MapLibreMap, Marker } from 'maplibre-gl';
import { NAV_ZOOM } from '../config';
import { getLocale, t } from '../i18n';
import { keepAboveAttribution } from '../ui/aboveAttribution';
import type { LatLon, RouteResult } from '../router/protocol';
import { etaClock, navDistance, TURN_ARROW } from './format';
import { type Maneuver, maneuvers, nextManeuver } from './maneuvers';
import { buildTrack, type Fix, locate, OffRouteDetector, type RouteTrack } from './progress';

export interface NavigationDeps {
  map: MapLibreMap;
  /** Compute a new route from the current position to the destination. */
  reroute(from: LatLon): Promise<RouteResult | null>;
  /** Show a (new) route on the map. */
  showRoute(r: RouteResult, from: LatLon): void;
  /** Called after navigation ended (button or error). */
  onExit(): void;
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
    '<span class="nav-limit" hidden></span><span class="nav-summary"></span><button type="button" class="nav-stop">✕</button>';
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

  let active = false;
  let watchId: number | null = null;
  let route: RouteResult | null = null;
  let track: RouteTrack | null = null;
  let turns: Maneuver[] = [];
  let alongM = 0;
  let following = true;
  let rerouting = false;
  let lastFix: Fix | null = null;
  let bearing = 0;
  let wake: WakeLockSentinelLike | null = null;
  const offRoute = new OffRouteDetector();

  const setRoute = (r: RouteResult) => {
    route = r;
    track = buildTrack(r.geometry, r.profile);
    turns = maneuvers(track);
    alongM = 0;
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

  const follow = (fix: Fix) => {
    if (!following) return;
    const m = deps.map;
    const c = m.getCenter();
    const farM = Math.hypot((c.lat - fix.lat) * 111_195, (c.lng - fix.lon) * 111_195 * Math.cos((fix.lat * Math.PI) / 180));
    const target = { center: [fix.lon, fix.lat] as [number, number], zoom: NAV_ZOOM, bearing };
    // Far away (start, GPS jump, after panning) or zoomed out: jump; else glide shorter than the fix interval.
    if (farM > 300 || Math.abs(m.getZoom() - NAV_ZOOM) > 1) m.jumpTo(target);
    else m.easeTo({ ...target, duration: 600, essential: true });
  };

  const render = (fix: Fix) => {
    if (!track || !route) return;
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
  };

  const doReroute = async (fix: Fix) => {
    rerouting = true;
    text.textContent = t('nav.rerouting');
    try {
      const r = await deps.reroute([fix.lat, fix.lon]);
      if (r && active) {
        setRoute(r);
        deps.showRoute(r, [fix.lat, fix.lon]);
      }
    } finally {
      rerouting = false;
    }
  };

  const onFix = (pos: GeolocationPosition) => {
    const fix: Fix = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy ?? 0 };
    // Heading: from the device when moving, else from the last fix if we moved a bit.
    const h = pos.coords.heading;
    if (h !== null && h !== undefined && !Number.isNaN(h) && (pos.coords.speed ?? 0) > 2) bearing = h;
    else if (lastFix) {
      const dy = fix.lat - lastFix.lat;
      const dx = (fix.lon - lastFix.lon) * Math.cos((fix.lat * Math.PI) / 180);
      if (Math.hypot(dx, dy) * 111_195 > 8) bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
    }
    lastFix = fix;
    dot.setLngLat([fix.lon, fix.lat]).addTo(deps.map);
    render(fix);
    follow(fix);
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
    following = false;
    recenter.hidden = false;
  });
  recenter.addEventListener('click', () => {
    following = true;
    recenter.hidden = true;
    if (lastFix) follow(lastFix);
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
      following = true;
      lastFix = null;
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
      document.body.classList.remove('nav-mode');
      top.hidden = bottom.hidden = recenter.hidden = true;
      dot.remove();
      deps.map.easeTo({ bearing: 0, duration: 400 });
      deps.onExit();
    },
  };
  return nav;
}
