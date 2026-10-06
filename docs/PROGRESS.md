# Progress log

Working log for the autonomous build loop. Each iteration reads this file
first, does ONE small runnable increment, then appends an entry below and
updates "Current state". Newest entries at the bottom.

## Current state
- Roadmap step: 1 (pipeline) — not started
- Next task: scaffold `pipeline/` (pyproject, ruff, pytest, config constants)
- Blockers / questions for the user: none
- Environment notes: python3 3.12 available; node/npm, ruff, pytest, osmium
  not installed globally (use a venv for Python tooling)

## Task backlog (step 1)
- [ ] Scaffold pipeline package (pyproject, config.py with documented constants)
- [ ] OSM tag parsing: access rules, maxspeed parsing, road class, surface, lit
- [ ] Graph builder from small test extract (.osm.pbf fixture or synthetic XML)
- [ ] Tiling: fixed grid, compact binary chunk format + format spec in docs
- [ ] CLI: extract -> tiles; run on a real small region (e.g. Bremen) and measure size
- [ ] Size extrapolation to Germany -> hosting options for user

## Log
### 2026-10-06 — Iteration 0 (setup)
- Read CLAUDE.md and PROJECT_BRIEF.md; resolved open decisions with user
  (see DECISIONS.md).
- Created this log and DECISIONS.md.
