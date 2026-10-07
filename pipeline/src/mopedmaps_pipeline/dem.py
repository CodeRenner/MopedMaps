"""Elevation from Copernicus DEM GLO-30 GeoTIFF tiles (tifffile + numpy).

Tiles are 1°x1°, float32, deflate-compressed with the floating-point
predictor (TIFF predictor 3). That predictor would need `imagecodecs`, so we
undo it ourselves in numpy (`undo_float_predictor`). Pixel-is-point: row 0
lies exactly on the tile's north edge. Data: © DLR e.V. 2010-2014 and ©
Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the
European Union and ESA (attribution required).
"""

import math
import zlib
from pathlib import Path

import numpy as np
import tifffile

ATTRIBUTION = "Elevation: Copernicus DEM GLO-30 (© DLR e.V., © Airbus DS, ESA/EU Copernicus)"


def tile_filename(lat_floor: int, lon_floor: int) -> str:
    ns = "N" if lat_floor >= 0 else "S"
    ew = "E" if lon_floor >= 0 else "W"
    return f"Copernicus_DSM_COG_10_{ns}{abs(lat_floor):02d}_00_{ew}{abs(lon_floor):03d}_00_DEM.tif"


def undo_float_predictor(raw: bytes, width: int, height: int) -> np.ndarray:
    """Inverse of TIFF predictor 3 for float32 (bytes are big-endian planes per row)."""
    a = np.frombuffer(raw, dtype=np.uint8).reshape(height, width * 4)
    a = np.cumsum(a, axis=1, dtype=np.uint8)  # byte-wise horizontal differencing
    planes = a.reshape(height, 4, width).transpose(0, 2, 1)  # MSB plane first
    return np.ascontiguousarray(planes).view(">f4").reshape(height, width).astype(np.float32)


class DemTile:
    def __init__(self, path: Path) -> None:
        with tifffile.TiffFile(path) as tif:
            page = tif.pages[0]
            scale = page.tags["ModelPixelScaleTag"].value
            tie = page.tags["ModelTiepointTag"].value
            self.dx, self.dy = float(scale[0]), float(scale[1])
            self.lon0, self.lat0 = float(tie[3]), float(tie[4])  # north-west pixel
            self.data = self._read(tif, page)
        self.height, self.width = self.data.shape

    @staticmethod
    def _read(tif: tifffile.TiffFile, page: tifffile.TiffPage) -> np.ndarray:
        if page.predictor != 3:
            return page.asarray().astype(np.float32)
        h, w = page.shape
        tw, th = page.tilewidth, page.tilelength
        out = np.empty((math.ceil(h / th) * th, math.ceil(w / tw) * tw), np.float32)
        across = math.ceil(w / tw)
        fh = tif.filehandle
        for i, (off, n) in enumerate(zip(page.dataoffsets, page.databytecounts, strict=True)):
            fh.seek(off)
            raw = zlib.decompress(fh.read(n))
            r, c = divmod(i, across)
            out[r * th : (r + 1) * th, c * tw : (c + 1) * tw] = undo_float_predictor(raw, tw, th)
        return out[:h, :w]

    def sample_array(self, lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
        """Vectorised bilinear interpolation (float64); edge pixels are clamped."""
        x = np.clip((np.asarray(lons, np.float64) - self.lon0) / self.dx, 0.0, self.width - 1.0)
        y = np.clip((self.lat0 - np.asarray(lats, np.float64)) / self.dy, 0.0, self.height - 1.0)
        x0 = x.astype(np.int64)
        y0 = y.astype(np.int64)
        x1 = np.minimum(x0 + 1, self.width - 1)
        y1 = np.minimum(y0 + 1, self.height - 1)
        fx, fy = x - x0, y - y0
        d = self.data
        top = d[y0, x0] * (1 - fx) + d[y0, x1] * fx
        bottom = d[y1, x0] * (1 - fx) + d[y1, x1] * fx
        return top * (1 - fy) + bottom * fy

    def sample(self, lat: float, lon: float) -> float:
        return float(self.sample_array(np.array([lat]), np.array([lon]))[0])


class Dem:
    """Lazily loads 1° tiles from a directory; NaN where no tile exists."""

    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self._tiles: dict[tuple[int, int], DemTile | None] = {}

    def _tile(self, lat: float, lon: float) -> DemTile | None:
        key = (math.floor(lat), math.floor(lon))
        if key not in self._tiles:
            path = self.directory / tile_filename(*key)
            self._tiles[key] = DemTile(path) if path.exists() else None
        return self._tiles[key]

    def elevation(self, lat: float, lon: float) -> float:
        tile = self._tile(lat, lon)
        return tile.sample(lat, lon) if tile else math.nan

    def sample_many(self, lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
        """Heights for many points, loading each 1° tile once and releasing it
        afterwards (country scale: one decoded tile in memory at a time)."""
        lats = np.asarray(lats, np.float64)
        lons = np.asarray(lons, np.float64)
        out = np.full(len(lats), np.nan)
        keys = np.floor(lats).astype(np.int64) * 1000 + np.floor(lons).astype(np.int64)
        order = np.argsort(keys, kind="stable")
        bounds = np.flatnonzero(np.diff(keys[order])) + 1
        for group in np.split(order, bounds):
            if len(group) == 0:
                continue
            key = (math.floor(lats[group[0]]), math.floor(lons[group[0]]))
            path = self.directory / tile_filename(*key)
            if not path.exists():
                continue
            tile = self._tiles.get(key) or DemTile(path)
            out[group] = tile.sample_array(lats[group], lons[group])
            del tile  # not cached: bounded memory
        return out
