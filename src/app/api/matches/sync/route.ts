import { NextRequest, NextResponse } from "next/server";

import { isDbConfigured, getKnownGameIds, getIncompleteGameIds, insertGames } from "@/lib/db";
import { SgpAuthError, syncAllRosterGames } from "@/lib/sgp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { token, refreshAll? } -> fetches everyone's recent ranked history
// with that one SGP token, keeps only 车队 games (>= MIN_TEAM_MEMBERS
// roster members on a side) from SYNC_SINCE_MS onward, and stores any not
// already in the DB.
//
// Normal syncs only write the genuinely new games, PLUS any already-known
// game that's missing player rows (getIncompleteGameIds -- a leftover from
// the old per-player-insert bug where a mid-sync timeout could permanently
// half-write a game; harmless now that insertGames is transactional, but
// existing corrupted rows still need one real re-fetch to backfill). This
// makes those self-heal on the very next auto-sync run with no manual
// action needed. insertGames's upsert makes re-writing an existing game
// harmless either way, but doing that for every already-known game on
// every sync would mean dozens of extra round trips to Postgres each time,
// risking this route's 60s timeout for no benefit on a day-to-day sync --
// so a fully-stored known game is still skipped. refreshAll opts into that
// slower full rewrite of everything, for the one-off case where a
// schema/rating change adds fields that already-synced games are missing.
//
// The token is a ~10-minute-lived bearer credential for the pasting user's
// own LoL account (see lol_ranked_sync/README.md). It is used in-memory for
// this one request only — never logged, never written to the database,
// never echoed back in the response.
export async function POST(req: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: "数据库还没配置好（缺 POSTGRES_URL），先在 Vercel 项目里连一个 Postgres 存储。" },
      { status: 503 }
    );
  }

  let token: string | undefined;
  let refreshAll = false;
  try {
    const body = (await req.json()) as { token?: string; refreshAll?: boolean };
    token = body.token?.trim();
    refreshAll = Boolean(body.refreshAll);
  } catch {
    // fall through to the missing-token error below
  }
  if (!token) {
    return NextResponse.json({ error: "缺少 token" }, { status: 400 });
  }

  try {
    // Fetch what's already stored BEFORE scanning SGP, so a routine sync
    // can stop paging through a player's history as soon as it reaches a
    // game that's already fully synced -- otherwise every run re-scans
    // all the way back to SYNC_SINCE_MS regardless of how much of that
    // window was already covered by an earlier sync, which is what was
    // pushing this route past its 60s budget (Vercel Runtime Timeout)
    // once enough games had piled up over the month. Known-but-incomplete
    // games are deliberately left OUT of the stop-set so the existing
    // self-heal-on-next-sync repair path keeps working.
    const [known, incomplete] = await Promise.all([getKnownGameIds(), getIncompleteGameIds()]);
    const fullyKnown = refreshAll
      ? undefined
      : new Set([...known].filter((id) => !incomplete.has(id)));
    const { games, perPlayer } = await syncAllRosterGames(token, { knownGameIds: fullyKnown });
    const newGames = games.filter((g) => !known.has(g.gameId));
    const repairedGames = games.filter((g) => known.has(g.gameId) && incomplete.has(g.gameId));
    const toStore = refreshAll ? games : [...newGames, ...repairedGames];
    if (toStore.length) {
      await insertGames(toStore);
    }
    return NextResponse.json({
      scannedGames: games.length,
      newGames: newGames.length,
      repairedGames: refreshAll ? 0 : repairedGames.length,
      totalGames: known.size + newGames.length,
      refreshedGames: refreshAll ? games.length : 0,
      perPlayer,
    });
  } catch (err) {
    if (err instanceof SgpAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[matches/sync] failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "同步失败，请重试" },
      { status: 502 }
    );
  }
}
