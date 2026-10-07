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
