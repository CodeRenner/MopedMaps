"""Tunable pipeline constants.

All assumptions live here so they are easy to find and tune. The pipeline
stores raw edge attributes only; vehicle-dependent values (travel time,
energy) are computed at runtime in the router.
"""

from typing import Final

# --- Tiling -----------------------------------------------------------------
# Fixed lat/lon grid. 0.25 deg is ~28 km north-south and ~17 km east-west in
# Germany, so a 75 km radius touches roughly 6x9 = 54 tiles. Re-evaluate after
# measuring real chunk sizes (hosting decision depends on it).
TILE_SIZE_DEG: Final[float] = 0.25

# --- Routable road classes --------------------------------------------------
# highway=* values that can ever carry a moped. Whether a specific vehicle may
# use them (e.g. motorway for vmax >= 60) is decided at runtime from the
# stored access flags and road class.
ROUTABLE_HIGHWAYS: Final[frozenset[str]] = frozenset(
    {
        "motorway",
        "motorway_link",
        "trunk",
        "trunk_link",
        "primary",
        "primary_link",
        "secondary",
        "secondary_link",
        "tertiary",
        "tertiary_link",
        "unclassified",
        "residential",
        "living_street",
        "service",
        "track",
        # Only routable when explicitly opened for mopeds (moped=yes etc.).
        "cycleway",
        "footway",
        "path",
        "pedestrian",
        "bridleway",
    }
)

# Classes excluded unless an explicit moped/mofa permission tag is present.
EXPLICIT_PERMISSION_HIGHWAYS: Final[frozenset[str]] = frozenset(
    {"cycleway", "footway", "path", "pedestrian", "bridleway"}
)

# --- Default speed limits (km/h) for unknown maxspeed -----------------------
# Per CLAUDE.md: urban 50, rural 100. The router caps these at vmax.
DEFAULT_SPEED_URBAN_KMH: Final[int] = 50
DEFAULT_SPEED_RURAL_KMH: Final[int] = 100
# German implicit limits used when maxspeed is a zone code like "DE:urban".
ZONE_SPEEDS_KMH: Final[dict[str, int]] = {
    "DE:urban": 50,
    "DE:rural": 100,
    "DE:motorway": 130,  # advisory speed, no general limit
    "DE:living_street": 7,
    "DE:walk": 7,
    "DE:zone30": 30,
    "DE:zone:30": 30,
    "DE:bicycle_road": 30,
}

# --- Risk score (roadmap step 5) ----------------------------------------------
# Static, vehicle-independent risk per edge, stored as 0..255 (see
# docs/risk-model.md). Points are summed from RISK_BASE and clamped. The
# router uses risk as "points per km" so long risky roads cost more.
RISK_BASE: Final[int] = 50
# (min speed limit km/h, points); first matching row from the top wins.
RISK_SPEED_POINTS: Final[tuple[tuple[int, int], ...]] = (
    (90, 60),
    (70, 40),
    (60, 25),
    (40, 0),
    (0, -15),  # <= 30 km/h streets are calmer
)
RISK_CLASS_POINTS: Final[dict[str, int]] = {
    "TRUNK": 25,
    "PRIMARY": 15,
    "SECONDARY": 10,
    "TERTIARY": 5,
    "UNCLASSIFIED": 5,
    "RESIDENTIAL": -10,
    "LIVING_STREET": -20,
    "SERVICE": 0,
    "TRACK": 10,
    "CYCLEWAY": -15,
    "PATH": 0,
    "MOTORWAY": 40,
}
# Fast roads without any cycle infrastructure (no escape space).
RISK_NO_CYCLEWAY_MIN_SPEED_KMH: Final[int] = 70
RISK_NO_CYCLEWAY_POINTS: Final[int] = 30
RISK_UNLIT_POINTS: Final[int] = 15
RISK_LIT_UNKNOWN_POINTS: Final[int] = 5
RISK_SURFACE_POINTS: Final[dict[str, int]] = {
    "UNKNOWN": 0,
    "PAVED": 0,
    "COBBLE": 15,
    "COMPACTED": 20,
    "UNPAVED": 40,
}
RISK_POINTS_PER_SIGNAL_PER_KM: Final[float] = 5.0
# Short edges mean dense junctions; points per junction per km, capped.
RISK_POINTS_PER_JUNCTION_PER_KM: Final[float] = 3.0
RISK_JUNCTION_POINTS_CAP: Final[int] = 30
