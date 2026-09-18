-- Adds the extra per-player columns the match detail page (/matches/[id])
-- now shows: champion/summoner-spell icons, multi-kills, first blood,
-- damage-type breakdown, turret damage, CC time, and ward counts. All of
-- this was already present in the SGP API response -- it just wasn't being
-- captured before. Old rows synced before this runs simply come back NULL
-- for these columns and the app defaults them to 0/false/"".
--
-- This is a single ALTER TABLE statement (multiple ADD COLUMN clauses
-- inside it still count as one command), so it should paste into the Neon
-- Query tool and run in one go -- no need to split it up.

ALTER TABLE match_players
  ADD COLUMN IF NOT EXISTS champion_id     INTEGER,
  ADD COLUMN IF NOT EXISTS spell1_id       INTEGER,
  ADD COLUMN IF NOT EXISTS spell2_id       INTEGER,
  ADD COLUMN IF NOT EXISTS multi_kill      TEXT,
  ADD COLUMN IF NOT EXISTS first_blood     BOOLEAN,
  ADD COLUMN IF NOT EXISTS physical_damage INTEGER,
  ADD COLUMN IF NOT EXISTS magic_damage    INTEGER,
  ADD COLUMN IF NOT EXISTS true_damage     INTEGER,
  ADD COLUMN IF NOT EXISTS turret_damage   INTEGER,
  ADD COLUMN IF NOT EXISTS cc_time         INTEGER,
  ADD COLUMN IF NOT EXISTS wards_placed    INTEGER,
  ADD COLUMN IF NOT EXISTS wards_killed    INTEGER;
