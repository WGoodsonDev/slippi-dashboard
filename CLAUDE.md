# CLAUDE.md

## Working Preferences
See `~/.claude/CLAUDE.md` for collaboration style, code standards, and git workflow.

---

## What This Project Is

slippi-dashboard is a full-stack web application for competitive Super Smash Bros. Melee
players to upload, analyze, and visualize derived data from Slippi `.slp` replay files.
Players upload replays, the server parses frame data using slippi-js, extracts structured
game data (combos, hit sequences, gamestate segments, positional samples), and stores it
persistently. The dashboard visualizes this data across multiple replays over time —
including spatial combo trajectory paths and per-gamestate positional heatmaps. The
non-trivial parts are the server-side parsing pipeline, the relational schema design for
frame-level data, and the aggregation queries that power multi-replay visualizations.

**Stack:**
- Frontend: React + TypeScript + Vite
- Backend: Node + Express + TypeScript
- Database: PostgreSQL via Prisma ORM
- Auth: Clerk
- File storage: AWS S3
- Testing: Vitest + Supertest
- Monorepo: npm workspaces (`client/`, `server/`, `shared/`)
- Frontend deploy: Vercel
- Backend deploy: Railway

**Deployed at:** https://slippi-dashboard-client.vercel.app/

---

## Commands

### Root (run from project root)
```
npm run dev          # start client + server concurrently (Vite :5173, nodemon :PORT)
npm run test         # run all workspace tests
```

### Client
```
npm run dev --workspace=client      # Vite dev server only
npm run build --workspace=client    # tsc + vite build
npm run lint --workspace=client     # ESLint
npm run preview --workspace=client  # preview production build locally
```

### Server
```
npm run dev --workspace=server      # nodemon + tsx (hot reload)
npm run build --workspace=server    # prisma generate + tsc
npm run start --workspace=server    # production start (migrate deploy + node dist/)
npm run test --workspace=server     # vitest run
npm run migrate --workspace=server  # prisma migrate dev (create + apply migration)
```

### Database (run from server/)
```
cd server && npx prisma studio      # open Prisma GUI
cd server && npx prisma db push     # push schema without migration file (dev only)
```

---

## Architectural Decisions Made

_Build this list incrementally as decisions are made. One line per decision is enough
here; full reasoning lives in the Technical Decision Log._

| Decision | Choice | Date |
|----------|--------|------|
| Monorepo structure | npm workspaces with client/, server/, shared/ | March 2026 |
| Backend framework | Express v5 + TypeScript | March 2026 |
| Database | PostgreSQL via Prisma (relational — data is relational, not document) | March 2026 |
| Auth | Clerk (not hand-rolled — security liability not worth it for a portfolio project) | March 2026 |
| File storage | AWS S3 for raw .slp files; derived data only in Postgres | March 2026 |
| Replay data strategy | Parse at upload time, store derived data only — not raw frame data | March 2026 |
| Position sampling | Every 6th frame (10fps) for heatmap data — full 60fps would bloat DB | March 2026 |
| Gamestate enum (v1) | NEUTRAL / HITSTUN / LEDGE / OFFSTAGE / DEAD — machine-detectable states | March 2026 |
| Frontend deploy | Vercel — zero-config for Vite, deployed via CI on merge to main | March 2026 |
| Backend deploy | Railway — Postgres provisioned as a plugin, deploys on merge to main via GitHub integration | March 2026 |
| CI/CD | GitHub Actions — test job gates Vercel deploy; branch protection on main enforces PR workflow | March 2026 |
| Combo percent tracking | Sequential accumulation from moves array at parse time — not cross-referenced from frame data | March 2026 |
| Integration test approach | Real slippi-js parser + committed .slp fixture + mocked Prisma — real test DB deferred to Phase 4 | March 2026 |
| Gamestate detection method | Action state ID ranges via slippi-js State enum — hitstunFramesRemaining is unreliable (null in practice) | March 2026 |
| HITSTUN scope | Includes DAMAGE_FALL (tumble, id 38) — uncontrollable knockback state, same disadvantage context as hitstun | March 2026 |
| OFFSTAGE detection | Hard-coded edge bounds for 6 tournament stages — non-tournament stages degrade to NEUTRAL (accepted constraint) | March 2026 |
| CORS | Restricted to CLIENT_URL env var in production; falls back to localhost:5173 in dev | March 2026 |

---

## Schema Reference

Full schema with column definitions and design rationale lives in `docs/SCHEMA.md`.
Key tables: Users → Games → GamePlayers, Combos → ComboHits, GamestateSegments → PositionSamples.

GamestateSegments are **per-player** (asymmetric) — always has a `perspective_player_id`.
PositionSamples attach to segments, not games directly — this is what enables per-gamestate heatmap filtering.

---

## Current Status
See `STATUS.md` for active phase and requirements checklist.
