-- Per-team objectives (dragon/baron/tower/inhibitor/riftHerald/atakhan/
-- horde kills + first blood) and bans, stored as one JSON blob per match --
-- see TeamStats in src/lib/sgp.ts for the shape. Powers the match-detail
-- page's "对局概览" section. One statement, safe to paste and run as-is.

ALTER TABLE matches ADD COLUMN IF NOT EXISTS team_stats TEXT;
