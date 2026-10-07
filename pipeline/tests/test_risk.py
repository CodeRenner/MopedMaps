from dataclasses import replace

import pytest

from mopedmaps_pipeline import config
from mopedmaps_pipeline.graph import Edge
from mopedmaps_pipeline.risk import RISK_MAX, effective_limit, risk_score
from mopedmaps_pipeline.tags import AccessFlag, RoadClass, Surface

BASE = Edge(
    from_node=1,
    to_node=2,
    way_id=1,
    geometry=((0.0, 0.0), (0.0, 0.01)),
    length_m=1000.0,
    road_class=RoadClass.RESIDENTIAL,
    maxspeed_fwd=50,
    maxspeed_bwd=50,
    flags=AccessFlag.MOPED | AccessFlag.MOFA,
    surface=Surface.PAVED,
    lit=True,
    cycleway=False,
    curvature_deg=0.0,
    signals=0,
)


def test_constants_cover_all_enum_members():
    assert set(config.RISK_CLASS_POINTS) == {c.name for c in RoadClass}
    assert set(config.RISK_SURFACE_POINTS) == {s.name for s in Surface}


def test_lit_residential_50_is_low():
    # base 50 - 10 residential + 0 speed + 3 junction/km
    assert risk_score(BASE) == 43


def test_fast_rural_road_without_cycleway_is_high():
    rural = replace(
        BASE, road_class=RoadClass.PRIMARY, maxspeed_fwd=100, maxspeed_bwd=100, lit=False
    )
    with_lane = replace(rural, cycleway=True)
    assert risk_score(rural) > risk_score(with_lane) > risk_score(BASE)
    assert risk_score(rural) - risk_score(with_lane) == config.RISK_NO_CYCLEWAY_POINTS


def test_zone30_bonus_and_surface_penalty():
    z30 = replace(BASE, maxspeed_fwd=30, maxspeed_bwd=30)
    assert risk_score(z30) < risk_score(BASE)
    assert risk_score(replace(BASE, surface=Surface.UNPAVED)) == risk_score(BASE) + 40


def test_unknown_limit_uses_class_default():
    e = replace(BASE, road_class=RoadClass.SECONDARY, maxspeed_fwd=None, maxspeed_bwd=None)
    assert effective_limit(e) == 100
    assert effective_limit(replace(e, maxspeed_bwd=70)) == 70


def test_dense_junctions_and_signals_scale_with_length():
    short = replace(BASE, length_m=50.0)
    assert risk_score(short) == risk_score(BASE) - 3 + config.RISK_JUNCTION_POINTS_CAP
    signal = replace(BASE, signals=2)
    assert risk_score(signal) == risk_score(BASE) + 10


@pytest.mark.parametrize("n", [0, 50, 1000])
def test_clamped(n):
    worst = replace(
        BASE,
        road_class=RoadClass.TRUNK,
        maxspeed_fwd=120,
        maxspeed_bwd=120,
        lit=False,
        surface=Surface.UNPAVED,
        signals=n,
        length_m=10.0,
    )
    assert 0 <= risk_score(worst) <= RISK_MAX
    calm = replace(
        BASE, road_class=RoadClass.LIVING_STREET, maxspeed_fwd=7, maxspeed_bwd=7, length_m=5000
    )
    assert risk_score(calm) >= 0
