# Graph size measurement (2026-10-06)

## Bremen (Geofabrik `bremen-latest.osm.pbf`, 20 MB)
Command: `python -m mopedmaps_pipeline build data/bremen-latest.osm.pbf data/tiles-bremen --verify`
(format v1, tile size 0.25°, Apple Silicon Mac)

| Metric            | Value        |
|-------------------|--------------|
| Tiles             | 5            |
| Junction nodes    | 51,387       |
| Edges             | 59,515       |
| Raw size          | 2.90 MB      |
| gzip -9 size      | 1.35 MB (46 %) |
| Largest tile      | 1.72 MB raw / 0.80 MB gzip (city of Bremen, `212_35`) |
| Wall time         | 5.7 s (read 3.5 s, graph 0.6 s) |
| Peak RAM (RSS)    | 245 MB       |

Bytes per edge ≈ 49 raw (36 fixed + node share + geometry), ≈ 23 gzipped.

## Extrapolation to Germany
Scaled by PBF size (Germany ≈ 4.4 GB ≈ 220 × Bremen). Bremen is denser than
average, so these are upper-bound-ish estimates.

| Metric          | Estimate              |
|-----------------|-----------------------|
| Raw total       | ~ 640 MB              |
| gzip total      | ~ 300 MB              |
| Non-empty tiles | ~ 700–900 (bbox ≈ 32 × 37 = 1,184 cells) |
| Largest tile    | ~ 2–4 MB raw (Ruhr, Berlin, Munich centre) |
| Build time      | ~ 20 min              |
| Peak RAM        | ~ 50 GB if done in one process — too much |

**Per-user download** for a 75 km radius (~54 tiles): rural ~ 10–20 MB gzip,
dense metro (Ruhr) ~ 40–70 MB gzip. Acceptable once, but worth shrinking
later (e.g. drop shape points from the routing chunk, smaller edge records).

## Consequences
1. **Build memory:** whole-Germany in one Python process will not fit a
   GitHub runner (7 GB). Plan: process per tile band (osmium extract with a
   one-tile overlap, keep only edges whose from-node is in the band), or
   replace dict-based storage with arrays. To do before step 8.
2. **Hosting:** ~ 300–650 MB in ~ 1,000 files, max file a few MB. See
   options in PROGRESS.md / ask user.

## Germany, measured (2026-10-07, streaming build, no DEM)
`python -m mopedmaps_pipeline build germany-latest.osm.pbf OUT --streaming`
on a 2023 Apple Silicon Mac (Geofabrik extract 4.5 GB).

| Metric | Value | Earlier estimate |
|--------|-------|------------------|
| Tiles | 844 | 700–900 |
| Junction nodes / edges | 14.2 M / 16.8 M | — |
| Raw size | 903 MB | ~640 MB |
| gzip size | 490 MB | ~300 MB |
| Largest tile | 4.87 MB (< Cloudflare Pages 25 MiB limit) | 2–4 MB |
| Wall time | 103 min (prefilter 12.3, junctions 4.1, edges 78.0, assemble ~8.8) | 20–60 min |
| Peak RAM | 1.58 GB | ~50 GB in-memory |
| Temp disk (workdir) | filtered PBF 0.85 GB + node index 0.97 GB + spool ≳ 4 GB | — |

Per-user download for a 75 km radius therefore ~1.6× the earlier estimate
(roughly 15–110 MB gzip depending on density).
