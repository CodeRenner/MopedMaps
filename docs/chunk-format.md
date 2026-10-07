# Graph chunk format (`.mmg`, version 1)

The routing graph is split on a fixed lat/lon grid (`TILE_SIZE_DEG`, default
0.25°, see `pipeline/src/mopedmaps_pipeline/config.py`). Each tile is one file.
Reference encoder/decoder: `pipeline/src/mopedmaps_pipeline/chunks.py`.

## Tiles
- Tile key `(ix, iy)` = `(floor(lon / size), floor(lat / size))`.
- File name: `{iy}_{ix}.mmg` (lat index first).
- A tile contains every junction node located in it, and every edge whose
  **from** node is in it. Tiles without nodes are not written.
- Nodes are addressed globally as `(tile, local index)`.

## Layout (all little-endian)

```
Header   32 bytes
Nodes    node_count × 8 bytes
Edges    edge_count × 36 bytes
Geometry geom_bytes bytes (varint stream)
```

### Header (32 bytes)
| Off | Type    | Field                                       |
|-----|---------|---------------------------------------------|
| 0   | char[4] | magic `"MMG1"`                              |
| 4   | uint16  | version (= 1)                               |
| 6   | uint16  | reserved (0)                                |
| 8   | int32   | ix (lon tile index)                         |
| 12  | int32   | iy (lat tile index)                         |
| 16  | int32   | tile size in 1e-7 degrees                   |
| 20  | uint32  | node_count                                  |
| 24  | uint32  | edge_count                                  |
| 28  | uint32  | geom_bytes                                  |

### Node (8 bytes)
| Off | Type  | Field              |
|-----|-------|--------------------|
| 0   | int32 | lat × 1e7          |
| 4   | int32 | lon × 1e7          |

### Edge (36 bytes)
Edges are undirected; direction is governed by the oneway flags.
"Forward" means from → to.

| Off | Type   | Field                                                         |
|-----|--------|---------------------------------------------------------------|
| 0   | uint32 | from: local node index in this tile                           |
| 4   | uint32 | to: local node index in tile `(ix+dx, iy+dy)`                 |
| 8   | int8   | dx (to-tile offset, lon)                                      |
| 9   | int8   | dy (to-tile offset, lat)                                      |
| 10  | uint8  | road class (`RoadClass` enum, `tags.py`)                      |
| 11  | uint8  | access flags (`AccessFlag` bitset, see below)                 |
| 12  | uint8  | maxspeed forward km/h, 0 = unknown                            |
| 13  | uint8  | maxspeed backward km/h, 0 = unknown                           |
| 14  | uint8  | bits 0–2 surface, bits 3–4 lit (0 unknown, 1 no, 2 yes), bit 5 cycleway |
| 15  | uint8  | traffic signals on edge (excl. start node), clamped to 255    |
| 16  | uint32 | length in decimetres                                          |
| 20  | uint16 | curvature: sum of heading changes in degrees                  |
| 22  | uint16 | ascent forward in decimetres (0 until roadmap step 6)         |
| 24  | uint16 | descent forward in decimetres (0 until roadmap step 6)        |
| 26  | uint8  | static risk score 1–255 (`docs/risk-model.md`); 0 = not computed (older builds) |
| 27  | uint8  | reserved                                                      |
| 28  | uint32 | byte offset of this edge's shape in the geometry section      |
| 32  | uint16 | number of intermediate shape points                           |
| 34  | uint16 | reserved                                                      |

Access flags: `1` MOPED, `2` MOFA, `4` MOTORROAD, `8` DESTINATION,
`16` ONEWAY, `32` ONEWAY_REVERSE. Motorway/trunk exclusion for vmax < 60 is
applied by the router from road class + MOTORROAD, not baked in.

### Geometry
Per edge, intermediate points only (endpoints are the from/to nodes). Each
point is two zigzag-encoded LEB128 varints: Δlat, Δlon in 1e-7 degrees,
relative to the previous point (the first relative to the from node).
