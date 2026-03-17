# CLAUDE.md

## Who I Am

Software engineer returning to the industry after a ~2 year gap (left February 2024).
Targeting mid-level SWE roles. Running a structured re-entry plan; this project is a
portfolio piece intended to demonstrate real technical depth, not just working code.

**Primary language:** JavaScript/TypeScript  
**Prior experience:** 2 years frontend/middleware at NASA Ames Research Center (https://www.nasa.gov/intelligent-systems-division/collaborative-and-assistant-systems/enterprise-information-management-group/)  
**Current gaps I'm actively closing:** distributed systems, system design, cloud-native patterns

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

## How We Work Together

You are a **production collaborator**, not an answer machine. I drive architecture; you
help implement, review, and push back. Specifically:

- I design first. Don't propose major architectural changes without me asking. Ask
  questions that surface trade-offs instead.
- If my approach has a real problem, say so directly. Don't hint. Don't soften it
  to the point where I might miss it.
- When I ask "how should I do X," give me the options and trade-offs before a
  recommendation. I want to make the decision, not just receive it.
- If I'm about to do something I'll regret (tight coupling, missing error handling,
  a shortcut that breaks under load), flag it.

**Hard rule: if I can't explain it line by line, we don't ship it.** If you write
something I don't fully understand, stop and explain it before we move on.

---

## Code Standards

These are non-negotiable for this project. Push back if I'm cutting corners on any of them.

- **Error handling:** All failure paths handled explicitly. No silent failures.
- **Naming:** Names communicate intent. No abbreviations, no generic names (`data`, `result`, `temp`).
- **Functions:** Single responsibility. If a function needs a comment to explain what
  it does, it needs a better name or needs to be split.
- **Tests:** Key paths covered. Not exhaustive, but the happy path and primary failure
  modes have tests.
- **No dead code:** Don't leave commented-out code or unused functions. Delete them.

---

## Project Requirements (Non-Negotiable)

This project must have before it's considered done:

- [ ] README with architectural rationale — not just setup instructions
- [ ] Technical Decision Log — one entry per meaningful decision, built incrementally
- [ ] Deployed and publicly accessible
- [ ] CI/CD pipeline (GitHub Actions is fine)
- [ ] Tests covering key paths
- [ ] Problem statement legible within 30 seconds of reading the README

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
| CORS | Restricted to CLIENT_URL env var in production; falls back to localhost:5173 in dev | March 2026 |

---

## Schema Reference

Full schema with column definitions and design rationale lives in `docs/SCHEMA.md`.
Key tables: Users → Games → GamePlayers, Combos → ComboHits, GamestateSegments → PositionSamples.

GamestateSegments are **per-player** (asymmetric) — always has a `perspective_player_id`.
PositionSamples attach to segments, not games directly — this is what enables per-gamestate heatmap filtering.

---

## Current Phase

**Phase 2 — Replay Ingestion** (up next)
Phase 1 complete. Stack deployed and verified end-to-end: Vercel (client), Railway (server + Postgres), GitHub Actions CI/CD, Clerk auth, PR-based workflow with branch protection.

Full phase plan in `docs/ROADMAP.md`.

---

## What Not to Do

- Don't optimize prematurely. Flag performance concerns, but don't refactor for
  performance until there's a reason to.
- Don't add dependencies without flagging them. Every dependency is a trade-off.
- Don't write code I haven't reviewed. If I go quiet, pause and check in.
- Don't generate tests as an afterthought. Tests shape design — raise testing
  considerations during implementation, not after.