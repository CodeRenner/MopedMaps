/**
 * Follow camera for navigation: the map moves smoothly with the rider and
 * turns with the road, the position marker stays glued to one spot on the
 * screen (lower part, so more of the road ahead is visible).
 *
 * Each GPS fix sets a new target (the position predicted for the next fix);
 * the camera glides there linearly over the fix interval, so it moves
 * continuously instead of jumping. Frames are capped (NAV_CAMERA_FPS) and
 * nothing is drawn while standing still, to save battery.
 */

import type { Map as MapLibreMap } from 'maplibre-gl';
import { NAV_CAMERA_FPS, NAV_POSITION_FROM_TOP, NAV_ZOOM } from '../config';

export interface CameraPose {
  lat: number;
  lon: number;
  /** degrees from north */
  bearing: number;
}

/** Shortest signed turn from a to b in degrees, in (-180, 180]. */
export function turnDelta(a: number, b: number): number {
  const d = (((b - a) % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}

/** Linear blend of two poses (u in 0..1), bearing the short way round. */
export function blendPose(a: CameraPose, b: CameraPose, u: number): CameraPose {
  const k = Math.max(0, Math.min(1, u));
  return {
    lat: a.lat + (b.lat - a.lat) * k,
    lon: a.lon + (b.lon - a.lon) * k,
    bearing: (a.bearing + turnDelta(a.bearing, b.bearing) * k + 360) % 360,
  };
}

/** Rough distance in metres between two poses. */
export function poseDistM(a: CameraPose, b: CameraPose): number {
  const dy = (b.lat - a.lat) * 111_195;
  const dx = (b.lon - a.lon) * 111_195 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

export class FollowCamera {
  private pose: CameraPose | null = null;
  private from: CameraPose | null = null;
  private to: CameraPose | null = null;
  private t0 = 0;
  private dur = 1;
  private raf = 0;
  private lastFrame = 0;

  constructor(
    private readonly map: MapLibreMap,
    /** Called with the drawn position each frame (to place the marker). */
    private readonly onPose: (p: CameraPose) => void,
  ) {}

  /** Show the position low on the screen (more road ahead); undone by `release`. */
  attach(): void {
    // The padded centre sits at (h + top) / 2 from the top; solve for NAV_POSITION_FROM_TOP * h.
    const h = this.map.getContainer().clientHeight;
    const top = Math.max(0, Math.round(h * (2 * NAV_POSITION_FROM_TOP - 1)));
    this.map.setPadding({ top, bottom: 0, left: 0, right: 0 });
  }

  /** While paused (rider panned the map) only the marker follows, the view stays. */
  paused = false;

  release(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.pose = this.from = this.to = null;
    this.map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  }

  /** Glide to `target` over `durationMs`; jumps when far away or on the first call. */
  moveTo(target: CameraPose, durationMs: number): void {
    const now = performance.now();
    if (!this.pose || poseDistM(this.pose, target) > 300) {
      this.pose = target;
      this.to = null;
      this.draw(target);
      return;
    }
    if (poseDistM(this.pose, target) < 0.5 && Math.abs(turnDelta(this.pose.bearing, target.bearing)) < 1) return; // standing
    this.from = this.pose;
    this.to = target;
    this.t0 = now;
    this.dur = Math.max(200, durationMs);
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  /** Snap back to the current target (after the rider panned the map). */
  recenter(): void {
    this.paused = false;
    const p = this.pose ?? this.to;
    if (p) this.draw(p);
  }

  private readonly frame = (now: number): void => {
    this.raf = 0;
    if (!this.from || !this.to) return;
    const u = (now - this.t0) / this.dur;
    if (now - this.lastFrame >= 1000 / NAV_CAMERA_FPS - 2 || u >= 1) {
      this.lastFrame = now;
      this.pose = blendPose(this.from, this.to, u);
      this.draw(this.pose);
    }
    if (u < 1) this.raf = requestAnimationFrame(this.frame);
  };

  private draw(p: CameraPose): void {
    if (!this.paused) this.map.jumpTo({ center: [p.lon, p.lat], bearing: p.bearing, zoom: NAV_ZOOM });
    this.onPose(p);
  }
}
