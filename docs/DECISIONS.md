# Decisions

Record of resolved project decisions. Open questions live in PROGRESS.md.

| Date       | Topic         | Decision                                           | Source |
|------------|---------------|----------------------------------------------------|--------|
| 2026-10-06 | Licence       | MIT                                                | user   |
| 2026-10-06 | vmax presets  | 25 and 45 km/h (default 45), plus free input       | user   |
| 2026-10-06 | Radius        | User-adjustable 25–100 km, default 75 (config)     | user   |
| 2026-10-06 | Chunk hosting | Deferred: measure tiled graph size after step 1, then present options | user |
| 2026-10-06 | Chunk hosting | Cloudflare Pages (free, unlimited bandwidth, ≤20k files, ≤25 MiB/file); deploy via GitHub Action with API token secret. Based on docs/size-measurement.md | user |
| 2026-10-06 | Node.js (dev) | Node 22 LTS tarball in `~/.local/node` (Homebrew not writable for this macOS user); use `export PATH="$HOME/.local/node/bin:$PATH"` | user |
| 2026-10-07 | Git workflow  | One branch + PR per roadmap step, stacked on the previous step's branch. When a step is complete, push and open the PR automatically (no need to ask). | user |
| 2026-10-07 | PLZ data      | GeoNames DE postal codes (CC BY 4.0), attribution in UI | user |
| 2026-10-07 | Basemap       | Start with OpenFreeMap vector style (no key/account), style URL in config; own PMTiles (Protomaps extract, likely on Cloudflare R2 because of Pages' 25 MiB file limit) later for true offline | user |
| 2026-10-07 | Bundler       | Vite (MIT, dev-only)                                 | user |
