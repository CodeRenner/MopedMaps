# Progress log

Working log for the autonomous build loop. Each iteration reads this file
first, does ONE small runnable increment, then appends an entry below and
updates "Current state". Newest entries at the bottom.

## Current state
- Roadmap step: 1 (pipeline) — in progress
- Next task: OSM tag parsing (access rules, maxspeed, road class, surface, lit) as pure functions with tests
- Blockers / questions for the user: none
- Environment notes: python3 3.12 available; node/npm, ruff, pytest, osmium
  not installed globally (use a venv for Python tooling)

## Task backlog (step 1)
- [x] Scaffold pipeline package (pyproject, config.py with documented constants)
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

### 2026-10-06 — Iteration 1 (pipeline scaffold)
- What: `pipeline/` package (src layout, pyproject with ruff+pytest config),
  `config.py` with tile size (0.25°), routable highway classes, classes that
  need explicit moped permission, default/zone speeds; root `.gitignore`.
- Why: roadmap step 1 foundation; constants centralised per CLAUDE.md.
- Tests: ruff check + format clean; pytest 3 passed.
- Commit: c687fec
- Dev setup: `python3 -m venv .venv && .venv/bin/pip install -e 'pipeline[dev]'`
- Next: tag parsing module.
