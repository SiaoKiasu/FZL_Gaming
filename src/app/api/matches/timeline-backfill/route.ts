import { NextRequest, NextResponse } from "next/server";
import { attachTimeline, scoreGame, type PlayerMetrics } from "@/lib/rating";
import { loadBaseline } from "@/lib/ratingBaseline";
import {
  countGamesMissingTimeline,
  getGameMetricsRows,
  getGamesMissingTimeline,
  isDbConfigured,
  updateGameRatings,
} from "@/lib/db";
import { SgpAuthError, fetchTimeline } from "@/lib/sgp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { token, limit? } -> pulls timelines for ranked games that were stored
// without one, recomputes their v3 metrics/scores, and reports how many are
// still pending. Resumable by design: the form keeps calling this until
// pending hits 0, so a backlog of any size fits the 60s-per-request budget
// and the 10-minute token. Nothing here needs the SUMMARY again -- the
// timeline carries the puuid↔participantId map, and team/position/win are
// already columns.
const DEFAULT_LIMIT = 40;
const CONCURRENCY = 4;
const GAP_MS = 400;

// GET -> just the current backlog count, no token needed. Lets the
// frontend show/hide the "补全 timeline" button and its count on page
// load, instead of only after a sync happens to surface a nonzero
// pending count (which it may never do -- see POST /api/matches/sync:
// its refreshAll stop-set is keyed on rating_dims, so games re-graded
// before this timeline feature shipped are treated as "already done"
// and skipped, and the button had no other way to learn about them).
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "数据库还没配置好" }, { status: 503 });
  }
  try {
    const pending = await countGamesMissingTimeline();
    return NextResponse.json({ pending });
  } catch (err) {
    console.error("[timeline-backfill] GET failed", err);
    return NextResponse.json({ error: "查询失败，请重试" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "数据库还没配置好" }, { status: 503 });
  }
  let token: string | undefined;
  let limit = DEFAULT_LIMIT;
  try {
    const body = (await req.json()) as { token?: string; limit?: number };
    token = body.token?.trim();
    if (Number.isInteger(body.limit) && body.limit! > 0) limit = Math.min(body.limit!, 100);
  } catch {
    // handled below
  }
  if (!token) return NextResponse.json({ error: "缺少 token" }, { status: 400 });

  const startedAt = Date.now();
  const deadline = startedAt + 45_000;
  try {
    const [gameIds, baseline] = await Promise.all([getGamesMissingTimeline(limit), loadBaseline()]);
    let done = 0;
    let failed = 0;
    let cursor = 0;
    const worker = async () => {
      while (cursor < gameIds.length && Date.now() < deadline) {
        const gameId = gameIds[cursor++];
        try {
          const [tl, stored] = await Promise.all([fetchTimeline(token!, gameId), getGameMetricsRows(gameId)]);
          const rows: PlayerMetrics[] = stored.map((r) => ({
            puuid: r.puuid,
            teamId: r.teamId,
            win: r.win,
            position: r.position,
            queueId: r.queueId,
            championId: r.championId,
            group: r.ratingGroup,
            tankIdx: r.metrics.tank_idx ?? 0.5,
            metrics: r.metrics,
          }));
          attachTimeline(rows, tl);
          const ratings = scoreGame(rows, baseline);
          await updateGameRatings(
            gameId,
            rows.map((r) => {
              const g = ratings[r.puuid];
              const ok = g && Number.isFinite(g.score);
              return {
                puuid: r.puuid,
                metrics: r.metrics,
                score: ok ? g.score : null,
                award: g?.award ?? "",
                ratingDims: ok ? Object.fromEntries(Object.entries(g.dims).map(([k, v]) => [k, Math.round(v * 100) / 100])) : null,
              };
            })
          );
          done++;
        } catch (err) {
          if (err instanceof SgpAuthError) throw err;
          failed++;
          console.warn(`[timeline-backfill] ${gameId} failed:`, err instanceof Error ? err.message : err);
        }
        await new Promise((r) => setTimeout(r, GAP_MS));
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, gameIds.length) }, worker));
    const pending = await countGamesMissingTimeline();
    return NextResponse.json({ done, failed, pending, elapsedMs: Date.now() - startedAt });
  } catch (err) {
    if (err instanceof SgpAuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("[timeline-backfill] failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "补全失败，请重试" }, { status: 502 });
  }
}
