-- FZL Gaming daily sign-up ("赛程" / schedule) store.
-- Run once against the same Postgres database as db/schema.sql (Vercel
-- dashboard -> Storage -> your Postgres -> Query, paste this in and run one
-- statement at a time if the query tool complains about multiple commands).

CREATE TABLE IF NOT EXISTS signups (
  signup_date       DATE NOT NULL,
  member            TEXT NOT NULL,
  position          TEXT,
  champion_pick_1   TEXT,
  champion_pick_2   TEXT,
  champion_pick_3   TEXT,
  declaration       TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (signup_date, member)
);

CREATE INDEX IF NOT EXISTS idx_signups_date ON signups(signup_date);
