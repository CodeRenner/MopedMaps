from pathlib import Path

import pytest

from mopedmaps_pipeline.geo import haversine_m, turn_deg
from mopedmaps_pipeline.graph import build_graph
from mopedmaps_pipeline.osm_xml import read_osm_xml
from mopedmaps_pipeline.tags import AccessFlag, RoadClass, Surface

FIXTURE = Path(__file__).parent / "fixtures" / "small.osm"


@pytest.fixture(scope="module")
def graph():
    return build_graph(read_osm_xml(FIXTURE))


def edge(graph, a, b):
    (e,) = [e for e in graph.edges if (e.from_node, e.to_node) == (a, b)]
    return e


def test_haversine_one_degree_lat():
    assert haversine_m((0, 0), (1, 0)) == pytest.approx(111_195, rel=1e-3)


def test_turn_deg_wraps():
    assert turn_deg(350, 10) == 20
    assert turn_deg(0, 180) == 180


def test_split_at_junction(graph):
    pairs = {(e.from_node, e.to_node) for e in graph.edges}
    assert pairs == {(1, 2), (2, 3), (2, 4), (3, 5)}


def test_unroutable_ways_dropped(graph):
    way_ids = {e.way_id for e in graph.edges}
    assert way_ids == {100, 101, 103}
    assert 6 not in graph.nodes


def test_shape_points_are_not_junctions(graph):
    assert 7 not in graph.nodes
    assert len(edge(graph, 3, 5).geometry) == 3


def test_edge_attributes(graph):
    e = edge(graph, 1, 2)
    assert e.road_class is RoadClass.RESIDENTIAL
    assert e.maxspeed_fwd == e.maxspeed_bwd == 30
    assert e.surface is Surface.PAVED
    assert e.lit is True
    assert e.length_m == pytest.approx(haversine_m((53.075, 8.80), (53.075, 8.81)))

    p = edge(graph, 2, 4)
    assert p.road_class is RoadClass.PRIMARY and p.maxspeed_fwd == 70
    assert p.cycleway and p.signals == 1
    assert p.lit is None


def test_mofa_only_cycleway(graph):
    e = edge(graph, 3, 5)
    assert AccessFlag.MOFA in e.flags and AccessFlag.MOPED not in e.flags
    assert e.curvature_deg > 0


def test_straight_edge_has_no_curvature(graph):
    assert edge(graph, 1, 2).curvature_deg == pytest.approx(0, abs=0.5)
