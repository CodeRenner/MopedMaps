/**
 * Tunable app constants. Every assumption about speeds, penalties and limits
 * lives here so it is easy to find and change. Values are first guesses and
 * are documented in docs/routing-model.md.
 */

import { RoadClass, Surface } from '../router/chunk';

// --- Vehicle profile ---------------------------------------------------------
/** Offered vmax presets in km/h (free input is also allowed). */
export const VMAX_PRESETS_KMH = [25, 45] as const;
export const DEFAULT_VMAX_KMH = 45;
export const MIN_VMAX_KMH = 6;
export const MAX_VMAX_KMH = 200;

/**
 * Vehicles up to this vmax are routed with mofa access rules (MOFA flag,
 * e.g. "Mofa frei" cycleways); faster ones use moped rules (MOPED flag).
 */
export const MOFA_MAX_VMAX_KMH = 25;

/**
 * Motorways and motorroads (Kraftfahrstraßen, motorroad=yes) are only open to
 * vehicles whose design speed exceeds 60 km/h (StVO §18). We allow them for
 * vmax >= this value; below it they are always excluded.
 */
export const MOTORWAY_MIN_VMAX_KMH = 60;

// --- Area --------------------------------------------------------------------
/** Radius around the chosen PLZ, user-adjustable within the bounds (km). */
export const DEFAULT_RADIUS_KM = 75;
export const MIN_RADIUS_KM = 25;
export const MAX_RADIUS_KM = 100;

// --- Speeds ------------------------------------------------------------------
/**
 * Assumed speed limit when maxspeed is unknown, by road class. CLAUDE.md:
 * urban 50, rural 100. The graph has no urban/rural flag yet, so classes
 * that are mostly urban use 50 and through roads use 100. Capped at vmax.
 */
export const DEFAULT_SPEED_BY_CLASS_KMH: Record<number, number> = {
  [RoadClass.MOTORWAY]: 130,
  [RoadClass.TRUNK]: 100,
  [RoadClass.PRIMARY]: 100,
  [RoadClass.SECONDARY]: 100,
  [RoadClass.TERTIARY]: 100,
  [RoadClass.UNCLASSIFIED]: 100,
  [RoadClass.RESIDENTIAL]: 50,
  [RoadClass.LIVING_STREET]: 7,
  [RoadClass.SERVICE]: 30,
  [RoadClass.TRACK]: 30,
  [RoadClass.CYCLEWAY]: 25,
  [RoadClass.PATH]: 25,
};

/** Multiplier on the effective speed by surface (small wheels, comfort). */
export const SURFACE_SPEED_FACTOR: Record<number, number> = {
  [Surface.UNKNOWN]: 1.0,
  [Surface.PAVED]: 1.0,
  [Surface.COBBLE]: 0.8,
  [Surface.COMPACTED]: 0.7,
  [Surface.UNPAVED]: 0.5,
};

// --- Time penalties (seconds) ------------------------------------------------
/**
 * Average wait per traffic-signal node. OSM usually maps one signalised
 * junction with several nodes (per direction, pedestrian lights), so this is
 * about half the real average wait (calibrated on Freiburg, docs/risk-model.md).
 */
export const SIGNAL_PENALTY_S = 5;
/** Per junction passed (every edge ends at a junction); default for classes not in JUNCTION_PENALTY_BY_CLASS_S. */
export const JUNCTION_PENALTY_S = 2;
/** Per degree of accumulated curvature along an edge. */
export const CURVATURE_PENALTY_S_PER_DEG = 0.02;
/** Extra cost for access=destination roads to discourage through traffic. */
export const DESTINATION_PENALTY_S = 120;

// --- Snapping ----------------------------------------------------------------
/** Max distance from a tapped point to the nearest usable road node (m). */
export const MAX_SNAP_DISTANCE_M = 1000;

// --- Map ---------------------------------------------------------------------
/**
 * Basemap style. OpenFreeMap: free, no key, no account (see DECISIONS.md).
 * Replace with an own PMTiles style for full offline use later.
 */
export const BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
/** Initial view: centre of Germany. */
export const MAP_INITIAL_CENTER: [number, number] = [10.45, 51.16]; // [lon, lat]
export const MAP_INITIAL_ZOOM = 5.3;
/** Where graph tiles are served from (relative to the app, or absolute URL). */
export const GRAPH_BASE_URL = './graph';
export const PLZ_TABLE_URL = './data/plz.json';

// --- Cost weights (roadmap step 5) -------------------------------------------
/** Slider ranges for cost = a·time + b·risk·km (+ c·energy in step 6). */
export const WEIGHT_TIME_RANGE = { min: 0.2, max: 2, step: 0.1, default: 1 } as const;
export const WEIGHT_RISK_RANGE = { min: 0, max: 3, step: 0.25, default: 0.5 } as const;
export const WEIGHT_ENERGY_RANGE = { min: 0, max: 3, step: 0.25, default: 0 } as const;
/** Route risk classification by length-weighted mean risk score. */
export const RISK_CLASS_LOW_MAX = 60;
export const RISK_CLASS_MEDIUM_MAX = 90;
/** Delay before rerouting while a slider is being dragged (ms). */
export const REROUTE_DEBOUNCE_MS = 150;

// --- Energy model (roadmap step 6), see docs/energy-model.md ---------------
export const GRAVITY = 9.81;
export const AIR_DENSITY = 1.2; // kg/m³
/** Vehicle + rider mass (kg). */
export const ENERGY_MASS_KG = 150;
/** Rolling resistance coefficient (scooter tyres on asphalt). */
export const ENERGY_CRR = 0.012;
/** Drag area Cd·A (m²) of an upright rider on a scooter. */
export const ENERGY_CDA_M2 = 0.6;
/** Electric: battery-to-wheel efficiency and share of descent energy recovered. */
export const ELECTRIC_EFFICIENCY = 0.8;
export const ELECTRIC_REGEN_SHARE = 0.3;
/** Combustion: fuel-to-wheel efficiency of a small engine, petrol energy, idle use. */
export const COMBUSTION_EFFICIENCY = 0.12;
export const PETROL_WH_PER_L = 8900;
export const COMBUSTION_IDLE_L_PER_H = 0.25;
/** Assumed wait per traffic-signal node for idle fuel (s); matches SIGNAL_PENALTY_S. */
export const IDLE_S_PER_SIGNAL = 5;
/** Routing cost per Wh of wheel energy, in seconds (cost = ... + c·energy). */
export const ENERGY_COST_S_PER_WH = 1;
/** Switch to the built-in fallback style if the basemap style hasn't loaded by then (ms). */
export const BASEMAP_TIMEOUT_MS = 8000;
/** Route climb: rises/falls smaller than this (m) are treated as noise (docs/elevation.md). */
export const CLIMB_HYSTERESIS_M = 5;
/** Route chart: elevation line is reduced to about this many points. */
export const ROUTE_CHART_MAX_POINTS = 300;

// --- Range (step 9), see docs/energy-model.md ------------------------------
/** Reference trip for calibrating against the user's real consumption: flat, no signals, this speed (capped at vmax). */
export const RANGE_REFERENCE_SPEED_KMH = 40;
/** Calibration factor (real / modelled consumption) is clamped to this range. */
export const RANGE_CALIBRATION_MIN = 0.3;
export const RANGE_CALIBRATION_MAX = 3;
/** Default reserve: warn when less than this share of battery/tank is left after the trip. */
export const RANGE_RESERVE_SHARE = 0.15;

// --- Speed differential risk (runtime, depends on vmax), docs/risk-model.md ---
/**
 * Extra risk points per km for each km/h the limit exceeds the vehicle's vmax
 * (being overtaken). Weighted by road class: Bundesstraßen (trunk/primary)
 * most, Landstraßen (secondary/tertiary/unclassified) less. Roads with a limit
 * <= RISK_DIFF_URBAN_MAX_KMH (typically urban) only get the urban factor.
 */
export const RISK_DIFF_URBAN_MAX_KMH = 50;
export const RISK_DIFF_URBAN_FACTOR = 0.3;
export const RISK_DIFF_CLASS_FACTOR: Record<number, number> = {
  1: 4, // trunk
  2: 3.5, // primary
  3: 2.5, // secondary
  4: 2, // tertiary
  5: 2, // unclassified
};
export const RISK_DIFF_DEFAULT_FACTOR = 1.5;
/**
 * 30 km/h main roads (e.g. a B3 through town) are calm and have right of way;
 * the static class points (trunk +25, primary +15, secondary +10) are removed
 * at runtime for limits <= this value.
 */
export const RISK_CALM_MAIN_ROAD_MAX_KMH = 30;
export const RISK_CLASS_POINTS_BY_CLASS: Record<number, number> = { 1: 25, 2: 15, 3: 10 };
/**
 * Junction penalty per edge by road class: on main roads (trunk..tertiary) you
 * usually have right of way; residential/unclassified streets often have
 * right-before-left. Classes not listed use JUNCTION_PENALTY_S.
 */
export const JUNCTION_PENALTY_BY_CLASS_S: Record<number, number> = { 1: 0.5, 2: 0.5, 3: 0.5, 4: 1, 5: 2, 6: 2, 7: 2 };
/**
 * Bundesstraßen (trunk/primary) carry heavy through traffic even at 50 km/h:
 * extra risk points per km for limits above RISK_CALM_MAIN_ROAD_MAX_KMH.
 */
export const RISK_MAIN_ROAD_POINTS: Record<number, number> = { 1: 50, 2: 40 };
/**
 * The pipeline adds 5 risk points per traffic signal (per km of the edge).
 * Signalised junctions are not riskier for a moped than unsignalised ones,
 * and the wait is already in the time cost, so the router refunds them.
 */
export const RISK_SIGNAL_REFUND_POINTS = 5;
