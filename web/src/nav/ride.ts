/**
 * What was actually ridden during navigation, for learning the real
 * consumption (router/learning.ts). Pure.
 *
 * On the route: the ridden part of each route (reroutes start a new one) is
 * booked with the route's modelled energy in proportion to its distance; an
 * arrival books the whole route. Off the route (wrong turn, detour, the
 * stretch before a reroute kicks in) there is no modelled energy, so a GPS
 * odometer measures the distance actually ridden and any extra over the
 * on-route distance is booked at the average consumption of the routes so far.
 */

import { RIDE_ODOMETER_MAX_ACCURACY_M, RIDE_ODOMETER_STEP_M } from '../config';
import { haversineM } from '../router/geo';
import type { Ride } from '../router/learning';
import type { Fix } from './progress';

interface MeteredRoute {
  distanceM: number;
  energyWh: number;
  fuelL: number;
}

export class RideMeter {
  private done: Ride = { km: 0, energyWh: 0, fuelL: 0 };
  private route: MeteredRoute | null = null;
  private alongM = 0;
  private odometerM = 0;
  private lastPoint: Fix | null = null;

  /** Start (or continue on a rerouted) route; the ridden part of the previous one is booked. */
  setRoute(r: MeteredRoute): void {
    this.book();
    this.route = r;
    this.alongM = 0;
  }

  /** Progress along the current route (m), only while on it; never goes back. */
  progress(alongM: number, arrived = false): void {
    if (!this.route) return;
    this.alongM = arrived ? this.route.distanceM : Math.max(this.alongM, Math.min(alongM, this.route.distanceM));
  }

  /**
   * GPS odometer: counts a step once the position moved RIDE_ODOMETER_STEP_M
   * from the last counted point, so jitter while standing adds nothing.
   * Inaccurate fixes are ignored.
   */
  fix(f: Fix): void {
    if (f.accuracy > RIDE_ODOMETER_MAX_ACCURACY_M) return;
    if (!this.lastPoint) {
      this.lastPoint = f;
      return;
    }
    const d = haversineM(this.lastPoint.lat, this.lastPoint.lon, f.lat, f.lon);
    if (d >= Math.max(RIDE_ODOMETER_STEP_M, f.accuracy)) {
      this.odometerM += d;
      this.lastPoint = f;
    }
  }

  /** The ride so far: on-route part plus any extra distance the GPS odometer saw. */
  total(): Ride {
    const on = this.onRoute();
    const extraKm = this.odometerM / 1000 - on.km;
    if (!(extraKm > 0) || !(on.km > 0)) return on;
    return {
      km: on.km + extraKm,
      energyWh: on.energyWh * (1 + extraKm / on.km),
      fuelL: on.fuelL * (1 + extraKm / on.km),
    };
  }

  private onRoute(): Ride {
    const r = this.route;
    if (!r || !(r.distanceM > 0) || this.alongM <= 0) return { ...this.done };
    const share = this.alongM / r.distanceM;
    return {
      km: this.done.km + this.alongM / 1000,
      energyWh: this.done.energyWh + r.energyWh * share,
      fuelL: this.done.fuelL + r.fuelL * share,
    };
  }

  private book(): void {
    this.done = this.onRoute();
    this.alongM = 0;
  }
}
