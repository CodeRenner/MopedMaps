"""Static per-edge risk score (0..255). Pure; constants in config.py.

Inputs are raw edge attributes only, so the score is the same for every
vehicle. Documented in docs/risk-model.md.
"""

from mopedmaps_pipeline import config
from mopedmaps_pipeline.graph import Edge
from mopedmaps_pipeline.tags import RoadClass

RISK_MAX = 255

# Assumed limit when maxspeed is unknown, mirroring the router's defaults
# (web/src/config DEFAULT_SPEED_BY_CLASS_KMH).
_DEFAULT_SPEED = {
    RoadClass.MOTORWAY: 130,
    RoadClass.TRUNK: 100,
    RoadClass.PRIMARY: 100,
    RoadClass.SECONDARY: 100,
    RoadClass.TERTIARY: 100,
    RoadClass.UNCLASSIFIED: 100,
    RoadClass.RESIDENTIAL: 50,
    RoadClass.LIVING_STREET: 7,
    RoadClass.SERVICE: 30,
    RoadClass.TRACK: 30,
    RoadClass.CYCLEWAY: 25,
    RoadClass.PATH: 25,
}


def effective_limit(e: Edge) -> int:
    known = [s for s in (e.maxspeed_fwd, e.maxspeed_bwd) if s is not None]
    return max(known) if known else _DEFAULT_SPEED[e.road_class]


def _speed_points(limit: int) -> int:
    for min_speed, pts in config.RISK_SPEED_POINTS:
        if limit >= min_speed:
            return pts
    return 0


def risk_score(e: Edge) -> int:
    limit = effective_limit(e)
    pts = float(config.RISK_BASE)
    pts += _speed_points(limit)
    pts += config.RISK_CLASS_POINTS[e.road_class.name]
    if limit >= config.RISK_NO_CYCLEWAY_MIN_SPEED_KMH and not e.cycleway:
        pts += config.RISK_NO_CYCLEWAY_POINTS
    if e.lit is False:
        pts += config.RISK_UNLIT_POINTS
    elif e.lit is None:
        pts += config.RISK_LIT_UNKNOWN_POINTS
    pts += config.RISK_SURFACE_POINTS[e.surface.name]
    km = max(e.length_m, 1.0) / 1000
    pts += config.RISK_POINTS_PER_SIGNAL_PER_KM * e.signals / km
    pts += min(config.RISK_JUNCTION_POINTS_CAP, config.RISK_POINTS_PER_JUNCTION_PER_KM / km)
    return max(0, min(RISK_MAX, round(pts)))
