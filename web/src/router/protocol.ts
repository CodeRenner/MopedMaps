/** Message protocol between the UI thread and the router worker. */

import type { CostWeights, VehicleProfile } from './profile';
import type { Closure } from './closures';
import type { Bbox, RoadLines } from './roads';
import type { RouteProfile } from './routeProfile';

export type LatLon = [number, number];

export type RouterRequest =
  | { type: 'load'; id: number; chunks: ArrayBuffer[] }
  | { type: 'closures'; id: number; closures: Closure[]; now: number }
  | { type: 'roads'; id: number; bbox: Bbox; maxClass: number; limit: number }
  | {
      type: 'route';
      id: number;
      from: LatLon;
      to: LatLon;
      profile: VehicleProfile;
      weights?: CostWeights;
    };

export type NoRouteReason = 'no-graph' | 'start-off-network' | 'target-off-network' | 'unreachable';

export interface RouteResult {
  distanceM: number;
  timeS: number;
  cost: number;
  riskAvg: number;
  energyWh: number;
  fuelL: number;
  ascentM: number;
  profile: RouteProfile;
  geometry: LatLon[];
  settled: number;
  computeMs: number;
}

export type RouterResponse =
  | { type: 'loaded'; id: number; nodeCount: number; edgeCount: number }
  | { type: 'closures'; id: number; matched: string[] }
  | { type: 'roads'; id: number; roads: RoadLines }
  | { type: 'route'; id: number; route: RouteResult }
  | { type: 'no-route'; id: number; reason: NoRouteReason }
  | { type: 'error'; id: number; message: string };
