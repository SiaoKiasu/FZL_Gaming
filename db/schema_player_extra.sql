-- More per-player stats for the match detail page (伤害减免/连杀/资源偷取/
-- 治疗队友/已花经济/死亡时长) -- all verified against a real saved match
-- (LOL/lol_ranked_sync/raw/games/*.json), top-level participant fields at
-- the same nesting level as kills/deaths/assists. Existing rows come back
-- NULL for these until the next sync with "刷新旧对局" checked. One
-- statement (multiple ADD COLUMN clauses in a single ALTER TABLE), safe to
-- paste and run as-is.

ALTER TABLE match_players
  ADD COLUMN IF NOT EXISTS damage_self_mitigated BIGINT,
  ADD COLUMN IF NOT EXISTS killing_sprees INTEGER,
  ADD COLUMN IF NOT EXISTS largest_killing_spree INTEGER,
  ADD COLUMN IF NOT EXISTS objectives_stolen INTEGER,
  ADD COLUMN IF NOT EXISTS heals_on_teammates BIGINT,
  ADD COLUMN IF NOT EXISTS gold_spent BIGINT,
  ADD COLUMN IF NOT EXISTS time_spent_dead INTEGER;
