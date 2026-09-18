import { NextRequest, NextResponse } from "next/server";

import { isDbConfigured, getKnownGameIds, insertGames } from "@/lib/db";
import { SgpAuthError, syncAllRosterGames } from "@/lib/sgp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { token } -> fetches everyone's recent ranked history with that one
// SGP token, keeps only 车队 games (>= MIN_TEAM_MEMBERS roster members on a
// side) from SYNC_SINCE_MS onward, and stores any not already in the DB.
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
  try {
    const body = (await req.json()) as { token?: string };
    token = body.token?.trim();
  } catch {
    // fall through to the missing-token error below
  }
  if (!token) {
    return NextResponse.json({ error: "缺少 token" }, { status: 400 });
  }

  try {
    const { games, perPlayer } = await syncAllRosterGames(token);
    const known = await getKnownGameIds();
    const newGames = games.filter((g) => !known.has(g.gameId));
    // Upsert everything scanned, not just the new games -- insertGames does
    // an ON CONFLICT ... DO UPDATE, so this also refreshes already-stored
    // games whenever a schema/rating change adds fields they're missing,
    // with no separate backfill step to remember to run.
    if (games.length) {
      await insertGames(games);
    }
    return NextResponse.json({
      scannedGames: games.length,
      newGames: newGames.length,
      totalGames: known.size + newGames.length,
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
