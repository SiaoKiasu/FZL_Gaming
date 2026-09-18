-- FZL Gaming match history store.
-- Run once against the project's Vercel Postgres database (Vercel dashboard
-- -> Storage -> your Postgres -> Query, paste this in and run), or via
-- `psql "$POSTGRES_URL" -f db/schema.sql` from a machine with network access
-- to it.

CREATE TABLE IF NOT EXISTS matches (
  game_id           TEXT PRIMARY KEY,
  game_creation_ms  BIGINT NOT NULL,
  duration_min      NUMERIC,
  queue_id          INTEGER,
  queue_name        TEXT,
  game_mode         TEXT,
  roster_count      INTEGER,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_players (
  game_id               TEXT NOT NULL REFERENCES matches(game_id) ON DELETE CASCADE,
  puuid                 TEXT NOT NULL,
  member                TEXT,
  player_name           TEXT,
  team_id               INTEGER,
  position              TEXT,
  champion              TEXT,
  win                   BOOLEAN,
  score                 NUMERIC,
  award                 TEXT,
  kills                 INTEGER,
  deaths                INTEGER,
  assists               INTEGER,
  kda                   NUMERIC,
  gold                  INTEGER,
  damage_to_champions   INTEGER,
  damage_taken          INTEGER,
  heal                  INTEGER,
  cs                    INTEGER,
  vision_score          INTEGER,
  champ_level           INTEGER,
  items                 TEXT,
  PRIMARY KEY (game_id, puuid)
);

CREATE INDEX IF NOT EXISTS idx_match_players_member ON match_players(member);
CREATE INDEX IF NOT EXISTS idx_matches_creation ON matches(game_creation_ms DESC);
