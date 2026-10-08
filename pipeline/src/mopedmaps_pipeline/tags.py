"""Pure OSM tag interpretation: access, maxspeed, road class, surface, lit.

No I/O here; every function takes a plain ``dict[str, str]`` of OSM tags so
it is trivially testable. Vehicle-dependent decisions (e.g. whether a vmax-25
mofa may use a trunk road) are NOT made here: we only store raw facts as flags
and the router applies the profile at runtime.
"""

import re
from enum import IntEnum, IntFlag
from typing import Final

from mopedmaps_pipeline import config

Tags = dict[str, str]


class RoadClass(IntEnum):
    """Compact road class code stored per edge (fits in one byte)."""

    MOTORWAY = 0
    TRUNK = 1
    PRIMARY = 2
    SECONDARY = 3
    TERTIARY = 4
    UNCLASSIFIED = 5
    RESIDENTIAL = 6
    LIVING_STREET = 7
    SERVICE = 8
    TRACK = 9
    CYCLEWAY = 10
    PATH = 11  # footway, path, pedestrian, bridleway


_HIGHWAY_TO_CLASS: Final[dict[str, RoadClass]] = {
    "motorway": RoadClass.MOTORWAY,
    "motorway_link": RoadClass.MOTORWAY,
    "trunk": RoadClass.TRUNK,
    "trunk_link": RoadClass.TRUNK,
    "primary": RoadClass.PRIMARY,
    "primary_link": RoadClass.PRIMARY,
    "secondary": RoadClass.SECONDARY,
    "secondary_link": RoadClass.SECONDARY,
    "tertiary": RoadClass.TERTIARY,
    "tertiary_link": RoadClass.TERTIARY,
    "unclassified": RoadClass.UNCLASSIFIED,
    "residential": RoadClass.RESIDENTIAL,
    "living_street": RoadClass.LIVING_STREET,
    "service": RoadClass.SERVICE,
    "track": RoadClass.TRACK,
    "cycleway": RoadClass.CYCLEWAY,
    "footway": RoadClass.PATH,
    "path": RoadClass.PATH,
    "pedestrian": RoadClass.PATH,
    "bridleway": RoadClass.PATH,
}


class AccessFlag(IntFlag):
    """Raw access facts per edge. The router combines them with the profile."""

    NONE = 0
    MOPED = 1  # usable by a 45 km/h moped (ignoring the vmax<60 motorway rule)
    MOFA = 2  # usable by a 25 km/h mofa (e.g. cycleway with "Mofa frei")
    MOTORROAD = 4  # motorroad=yes (Kraftfahrstraße): only for vmax >= 60
    DESTINATION = 8  # access=destination: allowed but should be penalised
    ONEWAY = 16  # traffic only in way direction
    ONEWAY_REVERSE = 32  # traffic only against way direction (oneway=-1)


class Surface(IntEnum):
    UNKNOWN = 0
    PAVED = 1  # asphalt, concrete
    COBBLE = 2  # paving stones, sett, cobblestone
    COMPACTED = 3  # compacted, fine_gravel
    UNPAVED = 4  # gravel, dirt, grass, ...


_SURFACE: Final[dict[str, Surface]] = {
    "asphalt": Surface.PAVED,
    "paved": Surface.PAVED,
    "concrete": Surface.PAVED,
    "concrete:plates": Surface.PAVED,
    "concrete:lanes": Surface.PAVED,
    "chipseal": Surface.PAVED,
    "paving_stones": Surface.COBBLE,
    "sett": Surface.COBBLE,
    "cobblestone": Surface.COBBLE,
    "unhewn_cobblestone": Surface.COBBLE,
    "compacted": Surface.COMPACTED,
    "fine_gravel": Surface.COMPACTED,
    "gravel": Surface.UNPAVED,
    "pebblestone": Surface.UNPAVED,
    "unpaved": Surface.UNPAVED,
    "dirt": Surface.UNPAVED,
    "earth": Surface.UNPAVED,
    "ground": Surface.UNPAVED,
    "grass": Surface.UNPAVED,
    "sand": Surface.UNPAVED,
    "mud": Surface.UNPAVED,
}

_ALLOWED: Final[frozenset[str]] = frozenset({"yes", "permissive", "designated", "destination"})
_DENIED: Final[frozenset[str]] = frozenset(
    {"no", "private", "agricultural", "forestry", "delivery", "customers", "use_sidepath"}
)

# OSM access hierarchy, most general first. Mofa is a sub-class of moped.
_MOPED_HIERARCHY: Final[tuple[str, ...]] = ("access", "vehicle", "motor_vehicle", "moped")
_MOFA_HIERARCHY: Final[tuple[str, ...]] = (*_MOPED_HIERARCHY, "mofa")

_SPEED_RE: Final = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*(mph|km/h|kmh)?\s*$")


def road_class(tags: Tags) -> RoadClass | None:
    """Return the road class, or None if the way is not routable at all."""
    hw = tags.get("highway")
    if hw is None or hw not in config.ROUTABLE_HIGHWAYS:
        return None
    if tags.get("area") == "yes":
        return None
    return _HIGHWAY_TO_CLASS[hw]


def parse_maxspeed(value: str | None) -> int | None:
    """Parse an OSM maxspeed value to km/h. None means unknown/unlimited.

    Handles plain numbers, ``mph``, German zone codes (``DE:urban``),
    ``walk`` and multi-values (``50;30`` -> the lower, conservative value).
    """
    if value is None:
        return None
    value = value.strip()
    if ";" in value:
        parsed = [parse_maxspeed(v) for v in value.split(";")]
        known = [p for p in parsed if p is not None]
        return min(known) if known else None
    if value in config.ZONE_SPEEDS_KMH:
        return config.ZONE_SPEEDS_KMH[value]
    if value == "walk":
        return config.ZONE_SPEEDS_KMH["DE:walk"]
    m = _SPEED_RE.match(value)
    if not m:
        return None  # "none", "signals", "variable", garbage
    speed = float(m.group(1))
    if m.group(2) == "mph":
        speed *= 1.609344
    return round(speed) if speed > 0 else None


def maxspeed_for_direction(tags: Tags, forward: bool) -> int | None:
    """maxspeed honouring ``maxspeed:forward`` / ``maxspeed:backward``."""
    directional = tags.get("maxspeed:forward" if forward else "maxspeed:backward")
    return parse_maxspeed(directional) or parse_maxspeed(tags.get("maxspeed"))


def _resolve(tags: Tags, hierarchy: tuple[str, ...], default: bool) -> tuple[bool, bool]:
    """Walk the access hierarchy; the most specific known tag wins.

    Returns ``(allowed, destination_only)``.
    """
    allowed, dest = default, False
    for key in hierarchy:
        raw = tags.get(key)
        if raw is None:
            continue
        # Lists like "agricultural;forestry" (German "landwirtschaftlicher Verkehr
        # frei"): denied when every listed class is denied, allowed if any is open.
        values = {v.strip() for v in raw.split(";")}
        if values & _ALLOWED:
            allowed, dest = True, values & _ALLOWED == {"destination"}
        elif values <= _DENIED:
            allowed, dest = False, False
    return allowed, dest


def access_flags(tags: Tags) -> AccessFlag:
    """Compute raw access flags. Returns NONE for unroutable ways."""
    rc = road_class(tags)
    if rc is None:
        return AccessFlag.NONE
    hw = tags["highway"]
    # Cycleways/footways are closed to mopeds unless explicitly opened.
    default = hw not in config.EXPLICIT_PERMISSION_HIGHWAYS
    moped, moped_dest = _resolve(tags, _MOPED_HIERARCHY, default)
    mofa, mofa_dest = _resolve(tags, _MOFA_HIERARCHY, default)
    if hw in config.EXPLICIT_PERMISSION_HIGHWAYS:
        # Generic access=yes on a cycleway does not open it for motor vehicles.
        moped = tags.get("moped") in _ALLOWED or tags.get("motor_vehicle") in _ALLOWED
        mofa = moped or tags.get("mofa") in _ALLOWED

    flags = AccessFlag.NONE
    if moped:
        flags |= AccessFlag.MOPED
    if mofa:
        flags |= AccessFlag.MOFA
    if not (moped or mofa):
        return AccessFlag.NONE
    if (moped and moped_dest) or (not moped and mofa_dest):
        flags |= AccessFlag.DESTINATION
    if tags.get("motorroad") == "yes":
        flags |= AccessFlag.MOTORROAD
    flags |= _oneway(tags, hw)
    return flags


def _oneway(tags: Tags, hw: str) -> AccessFlag:
    if tags.get("oneway:moped") == "no" or tags.get("oneway:mofa") == "no":
        return AccessFlag.NONE
    v = tags.get("oneway")
    if v in ("yes", "true", "1"):
        return AccessFlag.ONEWAY
    if v in ("-1", "reverse"):
        return AccessFlag.ONEWAY_REVERSE
    if v is None and (
        hw in ("motorway", "motorway_link") or tags.get("junction") in ("roundabout", "circular")
    ):
        return AccessFlag.ONEWAY
    return AccessFlag.NONE


def surface(tags: Tags) -> Surface:
    return _SURFACE.get(tags.get("surface", ""), Surface.UNKNOWN)


def lit(tags: Tags) -> bool | None:
    """True/False if tagged, None if unknown."""
    v = tags.get("lit")
    if v is None:
        return None
    return v not in ("no", "disused")


def has_cycleway(tags: Tags) -> bool:
    """Separate or on-road cycle infrastructure (safety score input)."""
    keys = ("cycleway", "cycleway:both", "cycleway:left", "cycleway:right")
    return any(tags.get(k) not in (None, "no", "none") for k in keys)
