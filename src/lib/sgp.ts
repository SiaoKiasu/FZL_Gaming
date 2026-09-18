import "server-only";

import championMap from "@/data/champions.json";
import { scoreGame } from "@/lib/rating";
import {
  MIN_TEAM_MEMBERS,
  SGP_BASE,
  SYNC_SINCE_MS,
  matchesRoster,
  rosterNameByPuuid,
  rosterPuuidSet,
} from "@/lib/matchesRoster";

// Ported from lol_ranked_sync/fetch_matches.py + sync_ranked.py. This talks
// to Tencent's internal LoL client API (not a public API) using a short-
// lived SGP token the user pastes in from get_sgp_token.ps1 — see
// lol_ranked_sync/README.md. The token is only ever held in memory for the
// duration of one sync request; it is never logged, stored, or persisted.

const UA = "LeagueOfLegendsClient/14.22.632.3512 (rcp-be-lol-match-history)";
// 只保留这 5 种模式；其余（大乱斗排位、克隆大乱斗、云顶之弈等）一律跳过。
// 420/440 是官方 queueId，来自 Riot 的 queues.json，非常确定。
// 450 = 大乱斗（Howling Abyss ARAM）。
// 2400 = 海克斯大乱斗（英文名 "ARAM: Mayhem"，2025 年上线的 ARAM 变体，与
//   Riot queues.json 中 2400 的描述吻合）。
// "匹配" 这个标签同时映射 400（老版 5v5 征召/Draft Pick）和 490
//   （Quickplay/新版"快速匹配"，2025 年起逐步替换 400）——国服客户端当前
//   到底用的是哪一个没能从公开资料 100% 确认，两个都收，实际同步后看
//   数据库里存的 queue_id 就能定论，多收的那个分支自然用不上。
const GAME_QUEUES: Record<number, string> = {
  420: "单双排",
  440: "灵活组排",
  450: "大乱斗",
  2400: "海克斯大乱斗",
  400: "匹配",
  490: "匹配",
};
const PAGE = 20;
const MAX_SCAN_DEFAULT = 400;
const WANT_DEFAULT = 60;
const REQUEST_GAP_MS = 1500; // matches lol_ranked_sync's SLEEP — don't lower this, it exists to avoid Tencent's risk control

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SgpAuthError extends Error {}

type Json = Record<string, unknown>;

function pick(d: Json, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = d[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function num(x: unknown): number {
  const n = typeof x === "number" ? x : parseFloat(String(x ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function teamRosterCount(g: Json, participants: Json[]): number {
  const counts: Record<number, number> = {};
  for (const p of participants) {
    if (rosterPuuidSet.has(String(p.puuid))) {
      const teamId = Number(p.teamId);
      counts[teamId] = (counts[teamId] ?? 0) + 1;
    }
  }
  const values = Object.values(counts);
  return values.length ? Math.max(...values) : 0;
}

async function fetchPage(
  token: string,
  puuid: string,
  startIndex: number
): Promise<Json[]> {
  const url = `${SGP_BASE}/match-history-query/v1/products/lol/player/${puuid}/SUMMARY?startIndex=${startIndex}&count=${PAGE}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": UA,
      Accept: "application/json",
    },
    // Never cache — this is live, credentialed data.
    cache: "no-store",
  });
  if (resp.status === 401) {
    throw new SgpAuthError("token 已失效或过期（有效期 10 分钟），请重新获取后再试");
  }
  if (!resp.ok) {
    throw new Error(`SGP 请求失败: ${resp.status} ${resp.statusText}`);
  }
  const data = (await resp.json()) as { games?: Array<{ json?: Json } & Json> };
  return (data.games ?? []).map((game) => (game.json ?? game) as Json);
}

export type FetchOptions = {
  want?: number;
  maxScan?: number;
  sinceMs?: number;
  minTeamMembers?: number;
};

/** Page through one player's ranked history, keeping only 车队 games
 * (>= minTeamMembers roster members on one team) newer than sinceMs. */
export async function fetchPlayerRosterGames(
  token: string,
  puuid: string,
  opts: FetchOptions = {}
): Promise<{ games: Map<string, Json>; scanned: number }> {
  const want = opts.want ?? WANT_DEFAULT;
  const maxScan = opts.maxScan ?? MAX_SCAN_DEFAULT;
  const sinceMs = opts.sinceMs ?? SYNC_SINCE_MS;
  const minTeamMembers = opts.minTeamMembers ?? MIN_TEAM_MEMBERS;

  const got = new Map<string, Json>();
  let start = 0;
  let firstPage = true;
  while (got.size < want && start < maxScan) {
    if (!firstPage) await sleep(REQUEST_GAP_MS);
    firstPage = false;
    const games = await fetchPage(token, puuid, start);
    if (!games.length) break;

    let sawAnyRecentEnough = false;
    for (const g of games) {
      const queueId = Number(pick(g, "queueId"));
      const createdMs = num(pick(g, "gameCreation", "gameCreationDate", "gameStartTimestamp"));
      if (createdMs >= sinceMs) sawAnyRecentEnough = true;
      if (!GAME_QUEUES[queueId]) continue;
      if (createdMs < sinceMs) continue;
      const participants = (g.participants as Json[]) ?? [];
      if (teamRosterCount(g, participants) < minTeamMembers) continue;
      const gameId = String(pick(g, "gameId", "matchId"));
      if (!got.has(gameId) && got.size < want) got.set(gameId, g);
    }
    start += PAGE;
    // Match history is newest-first: once a whole page is older than the
    // cutoff, every later page will be too — stop scanning this player.
    if (!sawAnyRecentEnough) break;
    if (games.length < PAGE) break;
  }
  return { games: got, scanned: start };
}

export type PlayerRow = {
  gameId: string;
  puuid: string;
  member: string;
  playerName: string;
  teamId: number;
  position: string;
  champion: string;
  win: boolean;
  score: number | null;
  award: string;
  kills: number;
  deaths: number;
  assists: number;
  kda: number | null;
  gold: number;
  damageToChampions: number;
  damageTaken: number;
  heal: number;
  cs: number;
  visionScore: number;
  champLevel: number;
  items: string;
};

export type GameRecord = {
  gameId: string;
  gameCreationMs: number;
  durationMin: number;
  queueId: number;
  queueName: string;
  gameMode: string;
  rosterCount: number;
  players: PlayerRow[];
};

const champNameMap = championMap as Record<string, string>;

export function buildGameRecord(g: Json): GameRecord {
  const participants = (g.participants as Json[]) ?? [];
  const durationRaw = num(pick(g, "gameDuration", "gameLength"));
  const durationMin = Math.round((durationRaw / 60) * 10) / 10;
  const gameId = String(pick(g, "gameId", "matchId"));
  const ratings = scoreGame(participants);

  const players: PlayerRow[] = participants.map((p) => {
    const puuid = String(p.puuid ?? "");
    const rating = ratings[puuid] ?? { score: null as unknown as number, award: "" };
    const champId = String(pick(p, "championId") ?? "");
    const name = pick(p, "riotIdGameName", "summonerName", "riotIdV2GameName");
    const tag = pick(p, "riotIdTagline", "riotIdTagLine");
    const kills = num(p.kills);
    const deaths = num(p.deaths);
    const assists = num(p.assists);
    const kda = deaths > 0 || kills + assists > 0 ? Math.round(((kills + assists) / Math.max(deaths, 1)) * 100) / 100 : null;
    const cs = num(p.totalMinionsKilled) + num(p.neutralMinionsKilled);
    const items = Array.from({ length: 7 }, (_, i) => String(num(p[`item${i}`]))).join(",");
    return {
      gameId,
      puuid,
      member: rosterNameByPuuid[puuid] ?? "",
      playerName: tag ? `${name}#${tag}` : String(name ?? ""),
      teamId: Number(p.teamId ?? 0),
      position: String(pick(p, "teamPosition", "individualPosition", "lane") ?? ""),
      champion: champNameMap[champId] ?? champId,
      win: Boolean(p.win),
      score: rating.score,
      award: rating.award,
      kills,
      deaths,
      assists,
      kda,
      gold: num(p.goldEarned),
      damageToChampions: num(p.totalDamageDealtToChampions),
      damageTaken: num(p.totalDamageTaken),
      heal: num(p.totalHeal),
      cs,
      visionScore: num(p.visionScore),
      champLevel: num(p.champLevel),
      items,
    };
  });

  const queueId = Number(pick(g, "queueId"));
  return {
    gameId,
    gameCreationMs: num(pick(g, "gameCreation", "gameCreationDate", "gameStartTimestamp")),
    durationMin,
    queueId,
    queueName: GAME_QUEUES[queueId] ?? "",
    gameMode: String(pick(g, "gameMode") ?? ""),
    rosterCount: teamRosterCount(g, participants),
    players,
  };
}

/** Sync all 8 roster members' recent ranked history with one token. */
export async function syncAllRosterGames(
  token: string,
  opts: FetchOptions = {}
): Promise<{ games: GameRecord[]; perPlayer: { name: string; scanned: number; found: number }[] }> {
  const allGames = new Map<string, Json>();
  const perPlayer: { name: string; scanned: number; found: number }[] = [];

  for (const [i, member] of matchesRoster.entries()) {
    if (i > 0) await sleep(REQUEST_GAP_MS);
    const { games, scanned } = await fetchPlayerRosterGames(token, member.puuid, opts);
    let foundNew = 0;
    for (const [gameId, g] of games) {
      if (!allGames.has(gameId)) {
        allGames.set(gameId, g);
        foundNew++;
      }
    }
    perPlayer.push({ name: member.name, scanned, found: games.size });
    void foundNew;
  }

  const games = Array.from(allGames.values()).map(buildGameRecord);
  games.sort((a, b) => b.gameCreationMs - a.gameCreationMs);
  return { games, perPlayer };
}
