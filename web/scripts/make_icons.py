"""Generate the app icons (own artwork) as PNGs without image libraries.

Run from repo root: .venv/bin/python web/scripts/make_icons.py
Design: rounded blue tile, white route line, green start and red end dot.
Shapes are defined in a 0..1 unit square and rendered with 4x supersampling.
"""

import struct
import zlib
from itertools import pairwise
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parents[1] / "public" / "icons"
BLUE = (43, 108, 176)
WHITE = (255, 255, 255)
GREEN = (47, 133, 90)
RED = (197, 48, 48)
ROUTE = [(0.26, 0.74), (0.42, 0.62), (0.40, 0.44), (0.58, 0.40), (0.74, 0.26)]


def _seg_dist(px, py, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    t = np.clip(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1)
    return np.hypot(px - (ax + t * dx), py - (ay + t * dy))


def render(size: int, maskable: bool) -> np.ndarray:
    ss = size * 4
    y, x = (np.mgrid[0:ss, 0:ss] + 0.5) / ss
    img = np.zeros((ss, ss, 4), np.float32)
    # Maskable icons need full-bleed background and content in the safe zone.
    scale, off = (0.72, 0.14) if maskable else (1.0, 0.0)
    if maskable:
        bg = np.ones_like(x, bool)
    else:
        r = 0.2
        cx, cy = np.clip(x, r, 1 - r), np.clip(y, r, 1 - r)
        bg = np.hypot(x - cx, y - cy) <= r
    img[bg] = (*BLUE, 255)

    def to_unit(p):
        return (off + p[0] * scale, off + p[1] * scale)

    pts = [to_unit(p) for p in ROUTE]
    d = np.full(x.shape, np.inf)
    for a, b in pairwise(pts):
        d = np.minimum(d, _seg_dist(x, y, a, b))
    img[d <= 0.045 * scale] = (*WHITE, 255)
    for (cx, cy), col in ((pts[0], GREEN), (pts[-1], RED)):
        dist = np.hypot(x - cx, y - cy)
        img[dist <= 0.09 * scale] = (*WHITE, 255)
        img[dist <= 0.065 * scale] = (*col, 255)
    small = img.reshape(size, 4, size, 4, 4).mean(axis=(1, 3))
    return np.clip(small + 0.5, 0, 255).astype(np.uint8)


def write_png(path: Path, rgba: np.ndarray) -> None:
    h, w, _ = rgba.shape
    raw = b"".join(b"\x00" + rgba[row].tobytes() for row in range(h))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data))
        )

    png = b"\x89PNG\r\n\x1a\n" + chunk(
        b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    )
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for size, name, maskable in [
        (180, "apple-touch-icon.png", True),  # iOS adds its own rounding
        (192, "icon-192.png", False),
        (512, "icon-512.png", False),
        (512, "icon-maskable-512.png", True),
    ]:
        write_png(OUT / name, render(size, maskable))
        print("wrote", name)


if __name__ == "__main__":
    main()
