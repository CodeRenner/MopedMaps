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
