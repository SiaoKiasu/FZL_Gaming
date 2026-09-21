-- FZL Gaming 视频 / 集锦 store.
-- Run once against the same Postgres database as db/schema.sql (Vercel
-- dashboard -> Storage -> your Postgres -> Query, paste this in and run one
-- statement at a time if the query tool complains about multiple commands).
--
-- The video files themselves live in Tencent COS (ap-hongkong), not here --
-- this database only ever stores the object key plus metadata. See
-- src/lib/cos.ts for why the bucket is in Hong Kong rather than on Vercel.

CREATE TABLE IF NOT EXISTS videos (
  id            BIGSERIAL PRIMARY KEY,
  -- Path inside the COS bucket. Always generated server-side
  -- (videos/<yyyy>/<mm>/<32 hex>.mp4), never taken from the client, so a
  -- crafted filename can't escape the prefix or overwrite someone else's
  -- upload.
  object_key    TEXT NOT NULL UNIQUE,
  poster_key    TEXT,
  title         TEXT NOT NULL,
  -- Roster nickname, not the "p1".."p8" id -- same convention as
  -- match_players.member and signups.member, so a member's games,
  -- sign-ups and clips can be joined on one value.
  member        TEXT NOT NULL,
  champion      TEXT,
  description   TEXT,
  duration_sec  NUMERIC,
  size_bytes    BIGINT,
  width         INTEGER,
  height        INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_member ON videos(member);

-- One row per (video, voter): the composite primary key is what enforces
-- "one vote each, changeable" -- a re-vote is an ON CONFLICT UPDATE, not a
-- second row, so nobody can stuff the ballot by submitting repeatedly.
CREATE TABLE IF NOT EXISTS video_ratings (
  video_id    BIGINT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  member      TEXT NOT NULL,
  score       SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 10),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (video_id, member)
);

CREATE TABLE IF NOT EXISTS video_comments (
  id          BIGSERIAL PRIMARY KEY,
  video_id    BIGINT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  member      TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_comments_video
  ON video_comments(video_id, created_at);

-- The upload password is NOT stored here: it lives in the
-- VIDEO_UPLOAD_PASSWORD environment variable (see src/lib/uploadAuth.ts).
-- Unlike the ledger password -- which members change themselves from the
-- fund page -- this one only exists to stop strangers from minting COS
-- upload URLs and running up the team's Tencent bill, so an env var the
-- Vercel maintainer sets once is the right amount of machinery.
