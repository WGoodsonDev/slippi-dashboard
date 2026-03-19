# Technical Decision Log

One entry per meaningful decision. Captures what was decided, why, and what was traded off.
Entries are added incrementally as decisions are made — not retroactively reconstructed.

---

## 001 — Monorepo with npm workspaces
**Date:** March 2026

**Decision:** Structure the project as an npm workspaces monorepo with `client/`, `server/`, and `shared/` packages.

**Why:** `shared/` allows TypeScript types (game structures, API contracts) to be defined once and imported by both client and server. Without it, types would need to be duplicated and kept in sync manually.

**Trade-off:** Adds workspace coordination overhead (e.g., running scripts across packages). Acceptable at this scale. A separate repo per package would be premature and would eliminate the shared type benefit.

---

## 002 — Express v5 + TypeScript on the backend
**Date:** March 2026

**Decision:** Use Express v5 with TypeScript for the server.

**Why:** Express is minimal and well-understood. v5 adds native async error handling, which removes the need for wrapper utilities. TypeScript catches contract mismatches between the parsing pipeline and the database layer at compile time.

**Trade-off:** Express v5 is relatively new and some ecosystem middleware hasn't caught up. Not a concern for this project's scope.

---

## 003 — PostgreSQL via Prisma ORM
**Date:** March 2026

**Decision:** PostgreSQL as the database, accessed through Prisma ORM.

**Why:** The data is relational — games have players, players have combos, combos have hits, segments have position samples. A document database would make cross-entity queries (e.g., "all HITSTUN heatmap data across replays for Marth") awkward. Prisma provides type-safe query building and schema-as-code migrations.

**Trade-off:** Prisma adds a layer between the application and SQL. Complex aggregation queries may be cleaner in raw SQL. Prisma supports `$queryRaw` as an escape hatch if needed.

---

## 004 — Clerk for authentication
**Date:** March 2026

**Decision:** Use Clerk for auth rather than implementing it manually.

**Why:** Hand-rolled auth (session management, password hashing, token rotation) is a security liability and significant implementation time for a portfolio project. Clerk handles all of it with a well-documented Express integration.

**Trade-off:** External dependency and vendor lock-in for auth. Acceptable — the `users` table stores only a `clerk_id` reference, so Clerk could be swapped out if needed by migrating that mapping.

---

## 005 — AWS S3 for raw .slp file storage
**Date:** March 2026

**Decision:** Store raw `.slp` replay files in S3. Store only derived data (combos, segments, samples) in PostgreSQL.

**Why:** Raw `.slp` files can be tens of megabytes each. Storing binaries in Postgres is an anti-pattern — it bloats the database and makes backups expensive. S3 is designed for object storage at scale.

**Trade-off:** New analysis types that require re-parsing frame data would need users to re-upload files (since the raw frames aren't stored in the DB). This is an accepted constraint for v1.

---

## 006 — Parse at upload time, store derived data only
**Date:** March 2026

**Decision:** Parse `.slp` files using `slippi-js` at upload time. Store only the computed results (combos, hit sequences, gamestate segments, position samples) — not raw frame data.

**Why:** Raw frame data at 60fps for a full game is ~28,000 frames × 2 players × multiple fields. Storing it across hundreds of replays would make the database enormous and slow to query. The derived data is what the dashboard actually needs.

**Trade-off:** Can't run new analysis types on historical replays without re-uploading. Explicitly accepted for v1.

---

## 007 — Position sampling at 10fps (every 6th frame)
**Date:** March 2026

**Decision:** Sample player positions every 6th frame (10fps equivalent) for heatmap data rather than storing every frame.

**Why:** Full 60fps position data per player per game would grow the `position_samples` table by roughly 6× for no meaningful visual difference in a heatmap — heatmap density doesn't require per-frame precision.

**Trade-off:** Fine-grained positional playback (e.g., animating movement paths) won't be possible from stored data. Not a v1 requirement.

---

## 008 — Gamestate enum: NEUTRAL / HITSTUN / LEDGE / OFFSTAGE / DEAD
**Date:** March 2026

**Decision:** Use five machine-detectable gamestates for v1. Gamestate is per-player (asymmetric) — every segment has a `perspective_player_id`.

**Why:** These five states are directly detectable from Slippi action states without heuristics. HITSTUN, LEDGE, and DEAD have clear action state signatures. OFFSTAGE can be derived from stage position bounds. NEUTRAL is the residual state.

**Trade-off:** OFFSTAGE conflates edgeguarding (offensive) and recovering (defensive) — two very different situations. Advantage/disadvantage quantification is deferred to v2. The v1 enum favors machine-detectability over conceptual accuracy.

---

## 009 — Prisma v7 datasource configuration via prisma.config.ts
**Date:** March 2026

**Decision:** Accept the Prisma v7 configuration model where the datasource URL lives in `prisma.config.ts` (via `dotenv`) rather than in `schema.prisma` as `url = env("DATABASE_URL")`.

**Why:** This is how Prisma v7 initializes by default. It separates runtime configuration from schema definition.

**Trade-off:** Differs from most tutorials and documentation online, which target Prisma v4/v5. The generated client also outputs to `src/generated/prisma/` instead of `node_modules/@prisma/client`, which changes import paths in application code. Both behaviors are non-obvious and worth documenting for future reference.

---

## 010 — move_id Int instead of move String on ComboHits
**Date:** March 2026

**Decision:** Store the raw `slippi-js` move ID (an integer) on `combo_hits.move_id` rather than a string move name.

**Why:** `slippi-js` represents moves as numeric action state IDs. Human-readable names ("upair", "neutral-b") are an application-layer mapping, not source data. Storing a string would enforce application-layer naming conventions at the database level — the wrong layer. If naming conventions change, a schema migration would be required just to rename a label.

**Trade-off:** Move names are not directly readable in the database. A lookup table or constants file in `shared/` is needed to translate IDs to display names. That mapping belongs in the parsing layer anyway.

---

## 011 — knockback_strength and knockback_angle need to cross-reference frame data
**Date:** March 2026

**Decision:** Store 0 for `knockback_strength` and `knockback_angle` on `ComboHit` records.

**Why:** These values are not exposed by slippi-js combo data directly. Accurate values would require cross-referencing raw frame data — specifically hitbox and physics state — which adds significant parsing complexity for fields that are not required by any v1 visualization. Storing 0 as a placeholder keeps the pipeline simple and the schema intact.

**Trade-off:** Knockback data is unavailable for analysis until this is revisited. Any future visualization or stat that depends on these fields will require a re-parse of affected replays.

**Signal that this was the wrong call:** A compelling use case for knockback data emerges in v1 or v2 — for example, visualizing kill confirm trajectories — that justifies the added parsing complexity.

---

## 012 — Combo percent tracking via sequential accumulation
**Date:** March 2026

**Decision:** Compute `percentBefore` and `percentAfter` on `ComboHit` records by accumulating damage sequentially across the `moves` array, starting from `combo.startPercent`. Not from frame data.

**Why:** Each entry in `combo.moves` carries a `damage` field. Accumulating from `startPercent` is direct and reliable. Cross-referencing frame data for post-hit percent would require identifying the correct post-frame update after each hit — extra complexity with no meaningful accuracy benefit for the dashboard's use cases.

**Trade-off:** May diverge slightly from exact in-game percent in edge cases (e.g., stale cheeseburger damage reduction in Melee). Not significant for heatmap or trajectory visualization.

---

## 013 — Integration test design: real parser, mocked database
**Date:** March 2026

**Decision:** Integration tests for the combo ingestion pipeline run the real `slippi-js` parser against a committed `.slp` fixture file. Prisma and S3 are mocked. Tests assert that the correct data shapes are passed to the database layer.

**Why:** The parsing logic — translating slippi-js data structures into schema-aligned shapes — is the highest-risk part of the pipeline. Running it against a real file catches regressions in combo extraction, player port resolution, and hit sequencing. Mocking Prisma keeps tests fast and sidesteps test database setup in Phase 2.

**Trade-off:** Tests verify that the right arguments reach Prisma, not that data persists correctly end-to-end. A test against a real database would catch Prisma schema mismatches and constraint violations. Deferred to Phase 4 hardening.

**Signal that this was the wrong call:** A schema migration or Prisma model change causes a silent test pass but a runtime failure — the kind of mismatch only a real DB would catch.

---

## 014 — Gamestate classification via action state ID ranges, not hitstunFramesRemaining
**Date:** March 2026

**Decision:** Classify hitstun using slippi-js action state ID ranges (`DAMAGE_START`–`DAMAGE_END`, `DAMAGE_FALL`) rather than the `hitstunFramesRemaining` post-frame field.

**Why:** `hitstunFramesRemaining` was found to be null/undefined across all frames in the fixture replay. Action state IDs are the reliable signal — slippi-js exports a `State` enum that covers the ranges needed for all five v1 gamestates (DYING, DAMAGE, CLIFF_CATCH). All gamestate classification runs off this enum.

**Trade-off:** `hitstunFramesRemaining` would provide more granular control — for example, detecting the last frame of hitstun rather than waiting for an action state transition. Not required for v1 heatmap use cases.

---

## 015 — DAMAGE_FALL (tumble) included in HITSTUN classification
**Date:** March 2026

**Decision:** Action state 38 (`DAMAGE_FALL`, the spinning tumble state after standard hitstun ends) is classified as HITSTUN rather than NEUTRAL.

**Why:** Tumble represents the same disadvantaged, uncontrollable situation as hitstun from a visualization perspective. A player in tumble is still being carried by knockback — they cannot act freely. Classifying tumble as NEUTRAL would fragment what is functionally a single disadvantage sequence into two segments.

**Trade-off:** Technically, a player in tumble can DI and choose their trajectory, unlike hard hitstun. The distinction is not relevant for v1 heatmap density visualization. Could be revisited in v2 if advantage quantification requires finer granularity.

---

## 016 — OFFSTAGE detection via hard-coded tournament stage edge bounds
**Date:** March 2026

**Decision:** OFFSTAGE is detected by comparing absolute x-position to a hard-coded edge value per stage. Only the 6 tournament-legal Melee stages are in the lookup. Replays from non-standard stages produce no OFFSTAGE segments (those frames fall through to NEUTRAL).

**Why:** slippi-js `getStageInfo()` returns only stage name and ID — no boundary data. Deriving bounds from blast zones would require additional heuristics with no accuracy advantage. Hard-coding for the 6 tournament stages covers the full target audience (competitive community replays) without a dependency or approximation.

**Trade-off:** Non-tournament stages silently degrade — OFFSTAGE frames are misclassified as NEUTRAL. Acceptable given the explicit competitive scope of the project. Documented in `replayParser.ts` as a comment on the lookup table.