-- v3 评分需要的两列。Run once (Vercel dashboard -> Storage -> Postgres -> Query).
--
-- metrics       每个玩家本局的 ~40 个评分输入指标（每分钟伤害、对线经济差、
--               承伤占比……见 src/lib/rating.ts 的 DIMS）。存下来有两个用处：
--               (1) 基线随库里的对局增长而自动更新——ratingBaseline.ts 用一条
--               percentile_cont 查询按职责组算分位数；(2) 以后改权重不用重新
--               拉 SGP，直接用存好的指标重算。
-- rating_group  "sr|TOP" / "mayhem|坦克" 这样的职责组，基线按它分组。
-- rating_dims   本局各评分维度的 z 分（相对同职责历史平均），对局详情页的
--               雷达图直接画它，不再用本局 10 人平均换算。
--
-- 老对局这两列为 NULL，评分仍是 v2 的旧分；在战绩页勾「刷新旧对局」跑一次
-- 同步就会全部按 v3 重算并补齐。

ALTER TABLE match_players
  ADD COLUMN IF NOT EXISTS metrics      JSONB,
  ADD COLUMN IF NOT EXISTS rating_group TEXT,
  ADD COLUMN IF NOT EXISTS rating_dims  JSONB;

CREATE INDEX IF NOT EXISTS idx_match_players_rating_group
  ON match_players(rating_group) WHERE rating_group IS NOT NULL;
