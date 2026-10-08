import pytest

from mopedmaps_pipeline.tags import (
    AccessFlag,
    RoadClass,
    Surface,
    access_flags,
    has_cycleway,
    lit,
    maxspeed_for_direction,
    parse_maxspeed,
    road_class,
    surface,
)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("50", 50),
        ("30 mph", 48),
        ("DE:urban", 50),
        ("DE:rural", 100),
        ("DE:zone30", 30),
        ("walk", 7),
        ("50;30", 30),
        ("none", None),
        ("signals", None),
        ("0", None),
        (None, None),
        ("abc", None),
    ],
)
def test_parse_maxspeed(value, expected):
    assert parse_maxspeed(value) == expected


def test_directional_maxspeed():
    t = {"maxspeed": "70", "maxspeed:backward": "50"}
    assert maxspeed_for_direction(t, forward=True) == 70
    assert maxspeed_for_direction(t, forward=False) == 50


def test_road_class():
    assert road_class({"highway": "primary_link"}) is RoadClass.PRIMARY
    assert road_class({"highway": "steps"}) is None
    assert road_class({"building": "yes"}) is None
    assert road_class({"highway": "pedestrian", "area": "yes"}) is None


def test_residential_open_for_both():
    f = access_flags({"highway": "residential"})
    assert AccessFlag.MOPED in f and AccessFlag.MOFA in f


def test_cycleway_closed_by_default():
    assert access_flags({"highway": "cycleway"}) == AccessFlag.NONE
    assert access_flags({"highway": "cycleway", "access": "yes"}) == AccessFlag.NONE


def test_cycleway_mofa_frei():
    f = access_flags({"highway": "cycleway", "mofa": "yes"})
    assert AccessFlag.MOFA in f and AccessFlag.MOPED not in f


def test_cycleway_moped_yes_opens_both():
    f = access_flags({"highway": "cycleway", "moped": "yes"})
    assert AccessFlag.MOPED in f and AccessFlag.MOFA in f


def test_motor_vehicle_no():
    assert access_flags({"highway": "track", "motor_vehicle": "agricultural"}) == AccessFlag.NONE
    # semicolon lists ("landwirtschaftlicher Verkehr frei")
    farm = {"highway": "track", "motor_vehicle": "agricultural;forestry"}
    assert access_flags(farm) == AccessFlag.NONE
    spaced = {"highway": "track", "vehicle": "forestry; agricultural"}
    assert access_flags(spaced) == AccessFlag.NONE
    dest = {"highway": "service", "motor_vehicle": "destination;delivery"}
    assert access_flags(dest) & AccessFlag.DESTINATION


def test_moped_overrides_motor_vehicle():
    f = access_flags({"highway": "service", "motor_vehicle": "no", "moped": "yes"})
    assert AccessFlag.MOPED in f


def test_private_and_destination():
    assert access_flags({"highway": "service", "access": "private"}) == AccessFlag.NONE
    f = access_flags({"highway": "residential", "motor_vehicle": "destination"})
    assert AccessFlag.DESTINATION in f


def test_motorroad_flag_and_motorway_implied_oneway():
    f = access_flags({"highway": "primary", "motorroad": "yes"})
    assert AccessFlag.MOTORROAD in f
    assert AccessFlag.ONEWAY in access_flags({"highway": "motorway"})


def test_oneway_variants():
    assert AccessFlag.ONEWAY in access_flags({"highway": "residential", "oneway": "yes"})
    assert AccessFlag.ONEWAY_REVERSE in access_flags({"highway": "residential", "oneway": "-1"})
    assert AccessFlag.ONEWAY in access_flags({"highway": "tertiary", "junction": "roundabout"})
    f = access_flags({"highway": "residential", "oneway": "yes", "oneway:moped": "no"})
    assert AccessFlag.ONEWAY not in f


def test_surface_lit_cycleway():
    assert surface({"surface": "sett"}) is Surface.COBBLE
    assert surface({}) is Surface.UNKNOWN
    assert lit({"lit": "yes"}) is True
    assert lit({"lit": "no"}) is False
    assert lit({}) is None
    assert has_cycleway({"cycleway:right": "lane"})
    assert has_cycleway({"cycleway:both": "separate"})
    assert not has_cycleway({"cycleway": "no"})
