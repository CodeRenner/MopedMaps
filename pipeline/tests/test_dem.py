import math
from pathlib import Path

import numpy as np
import pytest
import tifffile

from mopedmaps_pipeline.dem import Dem, DemTile, tile_filename, undo_float_predictor

REAL = Path(__file__).resolve().parents[2] / "data" / "dem"


def apply_float_predictor(a: np.ndarray) -> bytes:
    """Reference encoder (TIFF predictor 3) to test the decoder."""
    h, w = a.shape
    be = a.astype(">f4").view(np.uint8).reshape(h, w, 4)
    planes = be.transpose(0, 2, 1).reshape(h, w * 4)
    diff = np.diff(planes, axis=1, prepend=np.zeros((h, 1), np.uint8)).astype(np.uint8)
    return diff.tobytes()


def test_tile_filename():
    assert tile_filename(53, 8) == "Copernicus_DSM_COG_10_N53_00_E008_00_DEM.tif"
    assert tile_filename(-1, -2) == "Copernicus_DSM_COG_10_S01_00_W002_00_DEM.tif"


def test_predictor_roundtrip():
    rng = np.random.default_rng(1)
    a = rng.uniform(-50, 3000, size=(7, 5)).astype(np.float32)
    assert np.array_equal(undo_float_predictor(apply_float_predictor(a), 5, 7), a)


def _write_tile(path: Path, data: np.ndarray, lon0: float, lat0: float, dx: float, dy: float):
    tifffile.imwrite(
        path,
        data.astype(np.float32),
        extratags=[
            (33550, "d", 3, (dx, dy, 0.0)),  # ModelPixelScale
            (33922, "d", 6, (0.0, 0.0, 0.0, lon0, lat0, 0.0)),  # ModelTiepoint
        ],
    )


def test_bilinear_sampling_on_synthetic_tile(tmp_path):
    # 3x3 grid, 0.5° spacing, elevation = 10*col + 100*row
    data = np.array([[0, 10, 20], [100, 110, 120], [200, 210, 220]], np.float32)
    _write_tile(tmp_path / tile_filename(53, 8), data, 8.0, 54.0, 0.5, 0.5)
    t = DemTile(tmp_path / tile_filename(53, 8))
    assert t.sample(54.0, 8.0) == 0
    assert t.sample(53.75, 8.25) == pytest.approx(55)
    assert t.sample(53.0, 9.0) == 220
    assert t.sample(60.0, 20.0) == 20  # north of tile -> top row, east -> last column
    dem = Dem(tmp_path)
    assert dem.elevation(53.5, 8.5) == pytest.approx(110)
    assert math.isnan(dem.elevation(50.5, 8.5))
    many = dem.sample_many(np.array([53.5, 50.5, 53.75]), np.array([8.5, 8.5, 8.25]))
    assert many[0] == pytest.approx(110) and math.isnan(many[1]) and many[2] == pytest.approx(55)


def test_sample_many_matches_scalar_on_real_tiles():
    if not (REAL / tile_filename(53, 8)).exists():
        pytest.skip("local DEM tiles missing")
    dem = Dem(REAL)
    rng = np.random.default_rng(3)
    lats = rng.uniform(52.2, 53.9, 200)
    lons = rng.uniform(8.1, 9.9, 200)
    many = dem.sample_many(lats, lons)
    for la, lo, z in zip(lats, lons, many, strict=True):
        assert dem.elevation(la, lo) == z


@pytest.mark.skipif(not (REAL / tile_filename(53, 8)).exists(), reason="local DEM tiles missing")
def test_real_glo30_tiles_are_plausible():
    dem = Dem(REAL)
    # GLO-30 is a surface model (buildings, trees included): city points can
    # read well above the ~5-12 m terrain height.
    bremen = dem.elevation(53.0759, 8.8072)  # Bremen Marktplatz
    assert -2 < bremen < 40
    hills = dem.elevation(52.95, 8.15)  # Wildeshauser Geest, higher ground
    assert hills > bremen
    assert dem.elevation(52.5, 9.5) == dem.elevation(52.5, 9.5)  # finite, N52/E009 tile


def test_tiles_for_bbox_and_urls():
    from mopedmaps_pipeline.dem import GERMANY_BBOX, tile_url, tiles_for_bbox

    assert tiles_for_bbox(52, 8, 54, 10) == [(52, 8), (52, 9), (53, 8), (53, 9)]
    assert len(tiles_for_bbox(*GERMANY_BBOX)) == 88
    assert tile_url(53, 8) == (
        "https://copernicus-dem-30m.s3.amazonaws.com/"
        "Copernicus_DSM_COG_10_N53_00_E008_00_DEM/Copernicus_DSM_COG_10_N53_00_E008_00_DEM.tif"
    )


def test_fetch_tiles_skips_present_and_sea(tmp_path):
    from mopedmaps_pipeline.dem import fetch_tiles

    (tmp_path / tile_filename(52, 8)).write_bytes(b"old")
    calls = []

    def fake(url):
        calls.append(url)
        return None if "E009" in url else b"tif"

    stats = fetch_tiles([(52, 8), (53, 8), (53, 9)], tmp_path, fake)
    assert stats == {"downloaded": 1, "present": 1, "missing": 1}
    assert (tmp_path / tile_filename(52, 8)).read_bytes() == b"old"
    assert (tmp_path / tile_filename(53, 8)).read_bytes() == b"tif"
    assert len(calls) == 2
    assert not list(tmp_path.glob("*.part"))
