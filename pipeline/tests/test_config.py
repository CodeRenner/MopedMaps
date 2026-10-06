from mopedmaps_pipeline import config


def test_explicit_permission_classes_are_routable():
    assert config.EXPLICIT_PERMISSION_HIGHWAYS <= config.ROUTABLE_HIGHWAYS


def test_tile_size_divides_degree():
    assert (1 / config.TILE_SIZE_DEG).is_integer()


def test_default_speeds_match_brief():
    assert config.DEFAULT_SPEED_URBAN_KMH == 50
    assert config.DEFAULT_SPEED_RURAL_KMH == 100
