# slippi-dashboard — Database Schema

Designed prior to implementation. All tables are implemented via Prisma ORM against PostgreSQL.

---

## Entity Relationship Overview

```
Users
  └── Games (many)
        ├── GamePlayers (exactly 2)
        │     └── Combos — comboing_player_id (many)
        │     └── Combos — comboed_player_id (many)
        │           └── ComboHits (many, ordered)
        │     └── GamestateSegments — perspective_player_id (many)
        │           └── PositionSamples (many, sampled at 10fps)
        └── GamestateSegments (many, via game_id)
```

---

## Tables

### Users
Stores the application user. Auth is handled by Clerk — this table stores the Clerk reference only.

| Column | Type | Notes |
|---|---|---|
| id | UUID / serial | Primary key |
| clerk_id | string | Reference to Clerk user — unique |
| created_at | timestamp | |

---

### Games
Represents one parsed Slippi replay. The raw `.slp` file lives in S3; this table stores derived data and metadata.

| Column | Type | Notes |
|---|---|---|
| id | UUID / serial | Primary key |
| user_id | FK → Users | The account that uploaded this replay |
| stage | string | Stage name or ID |
| duration | integer | In frames |
| played_at | timestamp | From replay metadata, not upload time |
| slp_file_url | string | S3 object URL |
| created_at | timestamp | Upload time |

---

### GamePlayers
Exactly 2 rows per game. Represents each player in a game with their character, port, and identity.

| Column | Type | Notes |
|---|---|---|
| id | UUID / serial | Primary key |
| game_id | FK → Games | |
| is_user | boolean | True if this player is the account owner |
| character | string | Character name or ID |
| port | integer | Controller port (1–4) |
| connect_code | string | Slippi connect code e.g. "FIZZ#123" |
| slippi_rank | string | Optional — rank at time of game |
| end_stocks | integer | Stocks remaining at game end |
| end_percent | float | Damage percent at game end |

---

### Combos
One combo per row. Belongs to a game, has a comboing player and a comboed player (both FK to GamePlayers).

| Column | Type | Notes |
|---|---|---|
| id | UUID / serial | Primary key |
| game_id | FK → Games | |
| comboing_player_id | FK → GamePlayers | The player landing hits |
| comboed_player_id | FK → GamePlayers | The player receiving hits |
| start_percent | float | Comboed player's percent at first hit |
| end_percent | float | Comboed player's percent at last hit |
| led_to_ko | boolean | Whether the combo ended in a stock loss |
| hit_count | integer | Denormalized count of hits for query convenience |

---

### ComboHits
One row per hit within a combo. Ordered by sequence_number. Stores position and damage data for each individual hit.

| Column | Type | Notes |
|---|---|---|
| id | UUID / serial | Primary key |
| combo_id | FK → Combos | |
| sequence_number | integer | Preserves hit order within the combo |
| move_id | integer | Move that landed (attack ID or name) |
| comboing_x | float | Comboing player x position at this hit |
| comboing_y | float | Comboing player y position at this hit |
| comboed_x | float | Comboed player x position at this hit |
| comboed_y | float | Comboed player y position at this hit |
| percent_before | float | Comboed player percent before hit |
| percent_after | float | Comboed player percent after hit |
| knockback_strength | float | |
| knockback_angle | float | In degrees |

---

### GamestateSegments
A continuous timeline of gamestate segments for each game. Each segment is labeled from the perspective of one player.

Gamestate is **asymmetric** — NEUTRAL is shared, but all other states are per-player. Two segments can overlap in time if each represents a different player's perspective.

| Column | Type | Notes |
|---|---|---|
| id | UUID / serial | Primary key |
| game_id | FK → Games | |
| perspective_player_id | FK → GamePlayers | Whose perspective this segment represents |
| gamestate | enum | See gamestate enum below |
| start_frame | integer | |
| end_frame | integer | |

#### Gamestate Enum (v1)

| Value | Description |
|---|---|
| NEUTRAL | Neither player in hitstun, knockdown, or forced state. Both grounded or voluntarily aerial. |
| HITSTUN | This player has been hit and is in hitstun. Implies the opponent is in an advantageous position. |
| LEDGE | This player is grabbing the ledge. Detected via action state. |
| OFFSTAGE | This player is off-stage and not in hitstun. Could be recovering or edgeguarding — not distinguished in v1. |
| DEAD | This player is in a KO or respawn sequence. |

> **v2 note:** Advantage/disadvantage quantification is deliberately deferred. The v1 enum favors machine-detectable states over conceptual accuracy. HITSTUN implies disadvantage for the player in it; NEUTRAL implies neither player has a clear positional advantage.

---

### PositionSamples
Position data sampled from GamestateSegments at 10fps (every 6th frame). Used to generate heatmaps. Stored at the segment level, not the game level, so heatmaps can be filtered by gamestate.

| Column | Type | Notes |
|---|---|---|
| id | UUID / serial | Primary key |
| segment_id | FK → GamestateSegments | |
| player_id | FK → GamePlayers | Which player this position belongs to |
| x | float | Stage x coordinate |
| y | float | Stage y coordinate |
| frame | integer | Frame number within the game |

> **Sampling rationale:** A typical Melee game at 60fps produces ~28,000 frames. Storing both players every frame across hundreds of replays would bloat the database quickly. Every 6th frame (10fps equivalent) gives sufficient resolution for heatmap density visualization.

---

## Design Decisions

**GamePlayers as a join table, not columns on Games.** If player fields lived directly on Games (player1_character, player2_character, etc.), querying "all games where the user played Marth" would be awkward. The join table makes per-character and per-player queries clean.

**Derived data only, not raw frame data.** Raw `.slp` files are stored in S3. The database stores only computed results: combos, hits, segments, and sampled positions. This is cheaper at scale and faster to query. The tradeoff is that new analysis types can't be run on old replays without re-uploading.

**hit_count denormalized on Combos.** Counting ComboHits per combo at query time is an unnecessary join for a common display case. Stored at write time.

**perspective_player_id on GamestateSegments.** Gamestate is asymmetric. HITSTUN belongs to the player experiencing it. A query for "show me my heatmap during HITSTUN" joins through this column to filter correctly.

---

*Schema version: v1 — designed March 2026, pre-implementation*