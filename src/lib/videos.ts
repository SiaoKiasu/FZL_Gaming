import "server-only";

import { sql } from "@vercel/postgres";
import { playbackUrl } from "@/lib/cos";

export type VideoComment = {
  id: number;
  member: string;
  body: string;
  createdAt: string;
};

export type VideoItem = {
  id: number;
  title: string;
  member: string;
  champion: string | null;
  description: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  // Pre-signed COS URLs, minted per request. Null when COS isn't configured
  // yet (or a row somehow holds a key that fails validation) -- the page
  // renders the card without a player rather than blowing up.
  src: string | null;
  poster: string | null;
  avgScore: number | null;
  voteCount: number;
  // Every vote, so the page can show "you already gave this a 7" once the
  // viewer picks who they are. With 8 members this is at most 8 rows a video.
  scoresByMember: Record<string, number>;
  comments: VideoComment[];
};

export type VideoInput = {
  objectKey: string;
  posterKey: string | null;
  title: string;
  member: string;
  champion: string | null;
  description: string | null;
  durationSec: number | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
};

type VideoRow = {
  id: number;
  object_key: string;
  poster_key: string | null;
  title: string;
  member: string;
  champion: string | null;
  description: string | null;
  duration_sec: string | null;
  width: number | null;
  height: number | null;
  created_at: Date | string;
  avg_score: string | null;
  vote_count: string;
};

// DATE/TIMESTAMPTZ columns come back from the driver as real Date objects,
// which React refuses to render directly (see the note on LedgerRow in
// db.ts). Everything crossing into a component is normalised to a string
// here, once.
function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Loads the whole video wall in three queries rather than one join.
 *
 * Joining ratings and comments onto videos in a single statement would
 * multiply them out -- a video with 8 votes and 12 comments would come back
 * as 96 rows to be de-duplicated client-side. Three small, separately
 * grouped result sets are both less data over the wire and far easier to
 * reason about. (This is the opposite call from listMatches() in db.ts,
 * where the join is worth it because match_players is genuinely large and
 * strictly one-to-many.)
 */
export async function listVideos(limit = 200): Promise<VideoItem[]> {
  const { rows } = await sql<VideoRow>`
    SELECT v.id, v.object_key, v.poster_key, v.title, v.member, v.champion,
           v.description, v.duration_sec, v.width, v.height, v.created_at,
           r.avg_score, COALESCE(r.vote_count, 0) AS vote_count
    FROM videos v
    LEFT JOIN (
      SELECT video_id, AVG(score) AS avg_score, COUNT(*) AS vote_count
      FROM video_ratings
      GROUP BY video_id
    ) r ON r.video_id = v.id
    ORDER BY v.created_at DESC
    LIMIT ${limit}
  `;
  if (!rows.length) return [];

  // Re-selecting the same "newest N videos" window inside each of these
  // keeps them plain template literals. The alternative -- collecting the
  // ids above into an IN (...) list -- would mean stepping outside the sql
  // tag entirely, because @vercel/postgres interpolates primitive values
  // only, never arrays.
  const [ratings, comments] = await Promise.all([
    sql<{ video_id: number; member: string; score: number }>`
      SELECT r.video_id, r.member, r.score
      FROM video_ratings r
      JOIN (SELECT id FROM videos ORDER BY created_at DESC LIMIT ${limit}) v
        ON v.id = r.video_id
    `,
    sql<{
      id: number;
      video_id: number;
      member: string;
      body: string;
      created_at: Date | string;
    }>`
      SELECT c.id, c.video_id, c.member, c.body, c.created_at
      FROM video_comments c
      JOIN (SELECT id FROM videos ORDER BY created_at DESC LIMIT ${limit}) v
        ON v.id = c.video_id
      ORDER BY c.created_at ASC
    `,
  ]);

  const scoresByVideo = new Map<number, Record<string, number>>();
  for (const r of ratings.rows) {
    const bucket = scoresByVideo.get(r.video_id) ?? {};
    bucket[r.member] = Number(r.score);
    scoresByVideo.set(r.video_id, bucket);
  }

  const commentsByVideo = new Map<number, VideoComment[]>();
  for (const c of comments.rows) {
    const bucket = commentsByVideo.get(c.video_id) ?? [];
    bucket.push({
      id: c.id,
      member: c.member,
      body: c.body,
      createdAt: toIso(c.created_at),
    });
    commentsByVideo.set(c.video_id, bucket);
  }

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    member: r.member,
    champion: r.champion,
    description: r.description,
    durationSec: r.duration_sec === null ? null : Number(r.duration_sec),
    width: r.width,
    height: r.height,
    createdAt: toIso(r.created_at),
    src: playbackUrl(r.object_key),
    poster: r.poster_key ? playbackUrl(r.poster_key) : null,
    avgScore: r.avg_score === null ? null : Number(r.avg_score),
    voteCount: Number(r.vote_count),
    scoresByMember: scoresByVideo.get(r.id) ?? {},
    comments: commentsByVideo.get(r.id) ?? [],
  }));
}

// Mirrors getLedgerEntries()'s treatment of a pending migration: if
// db/schema_video.sql hasn't been run yet, the page should still render
// (empty, with a hint) instead of crashing the whole route.
export async function listVideosSafe(limit = 200): Promise<VideoItem[] | null> {
  try {
    return await listVideos(limit);
  } catch {
    return null;
  }
}

export async function insertVideo(input: VideoInput): Promise<number> {
  const { rows } = await sql<{ id: number }>`
    INSERT INTO videos (
      object_key, poster_key, title, member, champion, description,
      duration_sec, size_bytes, width, height
    ) VALUES (
      ${input.objectKey}, ${input.posterKey}, ${input.title}, ${input.member},
      ${input.champion}, ${input.description}, ${input.durationSec},
      ${input.sizeBytes}, ${input.width}, ${input.height}
    )
    RETURNING id
  `;
  return rows[0].id;
}

// One vote per member per video, changeable: the ON CONFLICT turns a
// re-vote into an update of the existing row (see the composite primary key
// in db/schema_video.sql).
export async function upsertRating(
  videoId: number,
  member: string,
  score: number
): Promise<void> {
  await sql`
    INSERT INTO video_ratings (video_id, member, score)
    VALUES (${videoId}, ${member}, ${score})
    ON CONFLICT (video_id, member)
    DO UPDATE SET score = EXCLUDED.score, updated_at = now()
  `;
}

export async function insertComment(
  videoId: number,
  member: string,
  body: string
): Promise<void> {
  await sql`
    INSERT INTO video_comments (video_id, member, body)
    VALUES (${videoId}, ${member}, ${body})
  `;
}

export async function videoExists(videoId: number): Promise<boolean> {
  const { rows } = await sql<{ id: number }>`
    SELECT id FROM videos WHERE id = ${videoId}
  `;
  return rows.length > 0;
}

export type VideoForDeletion = {
  member: string;
  objectKey: string;
  posterKey: string | null;
};

/**
 * The owner and storage keys of one video, for the delete route to check
 * against the session before removing anything.
 */
export async function getVideoForDeletion(
  videoId: number
): Promise<VideoForDeletion | null> {
  const { rows } = await sql<{
    member: string;
    object_key: string;
    poster_key: string | null;
  }>`
    SELECT member, object_key, poster_key FROM videos WHERE id = ${videoId}
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    member: row.member,
    objectKey: row.object_key,
    posterKey: row.poster_key,
  };
}

// Ratings and comments go with it: both carry ON DELETE CASCADE in
// db/schema_video.sql, so this single statement clears all three tables.
export async function deleteVideoRow(videoId: number): Promise<void> {
  await sql`DELETE FROM videos WHERE id = ${videoId}`;
}
