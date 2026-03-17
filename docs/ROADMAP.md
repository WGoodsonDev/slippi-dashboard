# slippi-dashboard — Project Roadmap

> A web-based dashboard for competitive Melee players to upload, analyze, and visualize derived data from Slippi replay files.

---

## Project Timeline Overview

```
PHASE 1          PHASE 2          PHASE 3          PHASE 4
Foundation    →  Ingestion     →  Visualizations → Polish
Weeks 1–3        Weeks 4–7        Weeks 8–12       Weeks 13–14
─────────────────────────────────────────────────────────────
Scaffolding      File Upload      Replay List      Error Handling
Auth             S3 Storage       Combo Paths      UX Edge Cases
DB Init          Parsing          Heatmaps         Test Coverage
CI/CD            Data Storage     Filters          Demo + README
```

---

## Phase 1 — Foundation
**Weeks 1–3 · ~18 hours**

The goal is a deployed skeleton. No replay features. A real user can create an account and that account is verifiable in the database.

### Checklist
- [x] Monorepo scaffolded (`client/`, `server/`, `shared/`)
- [x] TypeScript configured on both client and server
- [x] Express server with `/health` endpoint
- [x] Supertest test against `/health` passing
- [x] Shared type import proven across packages
- [x] Prisma initialized and connected to PostgreSQL
- [x] Schema defined and first migration run
- [x] Clerk auth integrated — sign up, log in, log out
- [x] React frontend deployed to Vercel
- [x] Server deployed to Railway
- [x] CI pipeline: push to `main` runs tests and deploys

### Stack Established
| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Vite |
| Backend | Node + Express + TypeScript |
| Database | PostgreSQL via Prisma |
| Auth | Clerk |
| File Storage | AWS S3 |
| Frontend Deploy | Vercel |
| Backend Deploy | Railway |
| Testing | Vitest + Supertest |

---

## Phase 2 — Replay Ingestion
**Weeks 4–7 · ~24 hours**

The backend becomes real. A replay file goes in, parsed data comes out, and derived data persists in the database.

### Pipeline

```
User uploads .slp file
        │
        ▼
Server receives file via multipart form
        │
        ▼
Raw .slp stored in AWS S3
        │
        ▼
slippi-js parses frame data server-side
        │
        ├──▶ Game metadata extracted
        │         (stage, duration, played_at, players)
        │
        ├──▶ Combos detected and sequenced
        │         (hits, positions, percents, KO flag)
        │
        ├──▶ Gamestate segments classified
        │         (NEUTRAL / HITSTUN / LEDGE / OFFSTAGE / DEAD)
        │
        └──▶ Position samples collected (every 6th frame)
                  (x, y, player, segment)

        ▼
Derived data stored in PostgreSQL via Prisma
        │
        ▼
S3 URL + game record linked in DB
```

### Checklist
- [ ] S3 bucket configured, file upload endpoint working
- [ ] slippi-js installed and parsing pipeline functional
- [ ] Gamestate detection logic implemented (v1 rules)
- [ ] Full Prisma schema migrated and seeded with test data
- [ ] API endpoints: `POST /replays`, `GET /replays`
- [ ] Integration tests covering upload → parse → store pipeline
- [ ] Duplicate upload handling

### Database Schema

```
Users
  └── Games (many)
        ├── GamePlayers (exactly 2)
        ├── Combos (many)
        │     └── ComboHits (many, ordered)
        └── GamestateSegments (many)
              └── PositionSamples (many, sampled at 10fps)
```

---

## Phase 3 — Core Visualizations
**Weeks 8–12 · ~30 hours**

The frontend-heavy phase. Two meaningful visualizations ship. Filtering makes the data explorable.

### Features

#### Replay List Dashboard
The user's home screen after logging in. Shows all uploaded replays with metadata — date, characters, stage, outcome. Entry point to individual replay analysis.

#### Visualization 1 — Combo Trajectory Paths
Each hit in a combo is plotted in stage-space. The path of both characters through the combo sequence is rendered as connected spatial lines. Useful for identifying combo routes and spacing tendencies.

```
Stage boundary
┌─────────────────────────────────┐
│                                 │
│    ①──②──③                      │  ① ② ③ = comboing player (hit sequence)
│          ╲                      │  ○ = comboed player (hit sequence)
│           ○──○──○               │
│                                 │
└─────────────────────────────────┘
```

#### Visualization 2 — Positional Heatmaps by Gamestate
Position samples aggregated across many replays and rendered as a density overlay on the stage. Filterable by gamestate (NEUTRAL, HITSTUN, OFFSTAGE, LEDGE). Reveals where a player tends to be in each situation.

```
Gamestate: NEUTRAL         Gamestate: HITSTUN
┌─────────────────┐        ┌─────────────────┐
│      ░░░        │        │  ████           │
│    ░░███░░      │        │  ████░          │
│   ░░████░░░     │        │   ░░░           │
│    ░░░░░░░      │        │                 │
└─────────────────┘        └─────────────────┘
Low ░░░ → High ███         (concentrated left)
```

#### Filtering
All visualizations are filterable by:
- Character (user's character)
- Opponent character
- Stage
- Date range
- Opponent connect code

### Checklist
- [ ] Replay list view with metadata
- [ ] Individual replay detail page
- [ ] Combo trajectory visualization
- [ ] Positional heatmap component
- [ ] Gamestate filter controls
- [ ] Backend: parameterized query endpoints for filtered data
- [ ] Loading and empty states for all views

---

## Phase 4 — Polish and Hardening
**Weeks 13–14 · ~12 hours**

What separates a portfolio project from a tutorial.

### Checklist
- [ ] Error handling throughout: malformed files, slow S3, failed parses
- [ ] Full UX edge cases covered: empty states, first-time user flow
- [ ] Unit tests on all parsing logic
- [ ] Integration test coverage on all critical API routes
- [ ] `README.md` explains architecture, not just how to run it
- [ ] Short demo video recorded
- [ ] GitHub repo presentable for an interviewer

---

## V2 Features (Post-Launch)

These are deliberately out of scope for v1. They represent the next layer of complexity once the foundation is proven.

| Feature | Description | Complexity |
|---|---|---|
| Combo node graph | Directed graph of combo states and follow-up options with branch probabilities | High |
| Historic suggestions | Per-node suggestions based on the user's own historical follow-up data | High |
| Frame data suggestions | Combo route calculation from frame data analysis | Very High |
| Advantage quantification | Richer gamestate detection beyond binary HITSTUN/NEUTRAL | High |
| Multi-replay comparison | Side-by-side visualization of the same player across sessions | Medium |

---

## Skills Honed by This Project

| Gap | How This Project Addresses It |
|---|---|
| Less familiar with testing | Vitest + Supertest from day one, on every phase |
| Deployable portfolio | Live URL, real users, real data |
| Shallow backend ownership | Full schema design, auth, file handling, parsing pipeline |
| CI/CD or cloud experience | S3, Railway deployment, CI pipeline |
| TypeScript | Enforced throughout — client, server, and shared |
| React currency | Hooks-era React with real state complexity |
| Persistent data modeling | Relational schema designed before a line was written |

---

*Last updated: Phase 1 complete*