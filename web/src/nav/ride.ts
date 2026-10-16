/**
 * What was actually ridden during navigation, for learning the real
 * consumption (router/learning.ts). Pure.
 *
 * The ridden part of each route (reroutes start a new one) is booked with the
 * route's modelled energy in proportion to its distance. That ignores where on
 * the route the hills are, which is fine for a stopped-early ride; arrivals
 * book the whole route.
 */

import type { Ride } from '../router/learning';

interface MeteredRoute {
  distanceM: number;
  energyWh: number;
  fuelL: number;
}

export class RideMeter {
  private done: Ride = { km: 0, energyWh: 0, fuelL: 0 };
  private route: MeteredRoute | null = null;
  private alongM = 0;

  /** Start (or continue on a rerouted) route; the ridden part of the previous one is booked. */
  setRoute(r: MeteredRoute): void {
    this.book();
    this.route = r;
    this.alongM = 0;
  }

  /** Progress along the current route (m); never goes back. */
  progress(alongM: number, arrived = false): void {
    if (!this.route) return;
    this.alongM = arrived ? this.route.distanceM : Math.max(this.alongM, Math.min(alongM, this.route.distanceM));
  }

  /** The ride so far, including the current route. */
  total(): Ride {
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
    this.done = this.total();
    this.alongM = 0;
  }
}
