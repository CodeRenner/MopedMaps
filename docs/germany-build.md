# Germany build (streaming pipeline)

Goal: build the tiled graph for all of Germany (~4.4 GB PBF) on a free GitHub
runner (7 GB RAM, ~14 GB disk). The in-memory build (`graph.build_graph`)
needs ~3 KB per edge in Python objects → ~50 GB for Germany.

Decision (2026-10-07, DECISIONS.md): two-pass streaming pipeline.

## Passes
0. **Pre-filter** (`streaming.prefilter`, done): keep routable ways,
   traffic-signal nodes and the nodes the ways reference
   (`osmium.BackReferenceWriter`). Bremen: 21.2 MB → 2.5 MB (12 %), node
   index 32 → 16 MB, 2.5 s. Germany estimate: ~0.5 GB PBF, index ~1–2 GB.
1. **Junction set** (`streaming.junction_ids`, done): read ways only
   (pyosmium `FileProcessor` + `KeyFilter("highway")`), collect node refs of
   routable ways into an `array('q')` (+ both endpoints once more), then
   `np.unique(..., return_counts=True)`; junctions = count ≥ 2.
   Same rule as the in-memory build. Memory ≈ 8 B × refs (+ sort copy).
   Bremen: 51,387 junctions in 1.25 s (identical to the in-memory build).
2. **Edges** (next): read ways again with node locations from an on-disk
   index (`sparse_file_array`), split at junctions (`np.searchsorted` on the
   junction array), compute edge attributes + risk, and append binary edge
   rows to a temp file per *from*-tile; write junction (id, lat, lon) rows per
   tile.
3. **Assemble**: per tile, sort its junctions by id → local indices; resolve
   to-node indices via the to-tile's sorted id list; write `.mmg` exactly as
   `chunks.split_into_chunks` does (byte-identical on Bremen as the test).
4. **Elevation**: node heights per tile, Laplacian smoothing needs neighbours
   across tile borders → process tile rows with a one-tile halo.

## Estimates (to be measured on a mid-size state)
- Pass 1: ~5 min, < 2 GB RAM for Germany (~100 M refs).
- Pass 2: dominated by pyosmium + per-way Python work, ~30–60 min.
- Disk after pre-filter: PBF 4.4 GB (can be deleted after pass 0) + filtered
  ~0.5 GB + node index ~1–2 GB + spool ~3 GB.

## Measured on Germany (2026-10-07)
See `docs/size-measurement.md`: 103 min, peak RAM 1.58 GB, 844 tiles,
903 MB raw / 490 MB gzip. The edge pass was I/O-bound (CPU ~32 %): the
on-disk `sparse_file_array` index (0.97 GB) is read randomly and the pickle
spools are bulky.

Follow-ups for the GitHub Action (runner: 7 GB RAM, ~14 GB free disk):
- Node index fits in RAM after the pre-filter → use `flex_mem` (≈1 GB) and
  drop the on-disk index.
- Compact binary spool rows instead of pickled `Edge` objects.
- Delete the source PBF right after the pre-filter (disk: 4.5 GB source +
  0.85 GB filtered + ≥4 GB spool + 0.9 GB tiles ≈ 11–13 GB otherwise).
