import "server-only";

// Titles (称号), not real names -- e.g. 134 -> "暗黑元首", not "辛德拉".
// This is what has always been stored in match_players.champion and shown
// throughout match history, so it stays on the title file rather than the
// real-name one in champions.json (that one now backs the schedule page's
// searchable champion picker instead -- see ChampionCombobox).
import championMap from "@/data/championTitles.json";
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
  // Games already stored in the DB (from a prior successful sync). When
  // set, pagination for a player stops as soon as it hits one of these --
  // everything older was covered by a previous sync, so there's no need
  // to keep re-scanning all the way back to sinceMs every single run.
  // Omit (or pass an empty set, e.g. for refreshAll) to scan the full
  // sinceMs window regardless of what's already stored.
  knownGameIds?: Set<string>;
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

  const knownGameIds = opts.knownGameIds;
  const got = new Map<string, Json>();
  let start = 0;
  let firstPage = true;
  let caughtUpToKnown = false;
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
      if (knownGameIds?.has(gameId)) {
        // Newest-first history hit a game this player already has synced
        // -- everything past this point was covered by an earlier sync,
        // so there's nothing new left to find for this player.
        caughtUpToKnown = true;
        continue;
      }
      if (!got.has(gameId) && got.size < want) got.set(gameId, g);
    }
    start += PAGE;
    // Match history is newest-first: once a whole page is older than the
    // cutoff, every later page will be too — stop scanning this player.
    if (!sawAnyRecentEnough) break;
    if (games.length < PAGE) break;
    if (caughtUpToKnown) break;
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
  championId: number;
  spell1Id: number;
  spell2Id: number;
  win: boolean;
  score: number | null;
  award: string;
  kills: number;
  deaths: number;
  assists: number;
  kda: number | null;
  multiKill: string; // "" | 双杀 | 三杀 | 四杀 | 五杀 (best achieved this game)
  firstBlood: boolean;
  gold: number;
  damageToChampions: number;
  physicalDamage: number;
  magicDamage: number;
  trueDamage: number;
  damageTaken: number;
  heal: number;
  turretDamage: number;
  ccTime: number; // seconds of CC applied to enemies
  cs: number;
  visionScore: number;
  wardsPlaced: number;
  wardsKilled: number;
  champLevel: number;
  items: string;
  // Verified against a real saved match (LOL/lol_ranked_sync/raw/games/*.json):
  // damageSelfMitigated, killingSprees, largestKillingSpree, objectivesStolen,
  // totalHealsOnTeammates, goldSpent, totalTimeSpentDead are all top-level
  // participant fields, same nesting level as kills/deaths/assists.
  damageSelfMitigated: number;
  killingSprees: number;
  largestKillingSpree: number;
  objectivesStolen: number;
  healsOnTeammates: number;
  goldSpent: number;
  timeSpentDead: number;
};

export type TeamStats = {
  bans: number[];
  dragon: number;
  baron: number;
  tower: number;
  inhibitor: number;
  riftHerald: number;
  atakhan: number;
  horde: number;
  firstBlood: boolean;
  // Per-objective "first to take it" flags, straight off the same
  // teams[].objectives.<key>.first field firstBlood already reads (that
  // one comes from objectives.champion.first). Absent/undefined on
  // matches synced before this field was added -- treat that as "unknown",
  // never as false, at the call site.
  firstTower: boolean;
  firstDragon: boolean;
  firstBaron: boolean;
  firstInhibitor: boolean;
  firstRiftHerald: boolean;
  firstAtakhan: boolean;
  firstHorde: boolean;
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
  // Keyed by teamId ("100"/"200") -- null for the rare game whose raw
  // response has no `teams` block (older client versions).
  teamStats: Record<string, TeamStats> | null;
};

const champNameMap = championMap as Record<string, string>;

/** Per-team objectives (dragon/baron/tower/... kills) and bans, straight
 * off the raw response's `teams` block -- confirmed against a real saved
 * match (LOL/lol_ranked_sync/raw/games/*.json): each entry has
 * {bans:[{championId,pickTurn}], objectives:{dragon:{first,kills}, baron:
 * {...}, tower:{...}, inhibitor:{...}, riftHerald:{...}, atakhan:{...},
 * horde:{...}, champion:{first,kills}}, teamId, win}. ARAM games report the
 * same shape with 0s for Summoner's Rift-only objectives (no dragon/baron
 * there), so this reads safely across queues without guessing at a
 * mode-specific schema. */
function buildTeamStats(g: Json): Record<string, TeamStats> | null {
  const teams = (g.teams as Json[]) ?? [];
  if (!teams.length) return null;
  const out: Record<string, TeamStats> = {};
  for (const t of teams) {
    const teamId = String(t.teamId ?? "");
    if (!teamId) continue;
    const bans = ((t.bans as Json[]) ?? [])
      .map((b) => Number(b.championId))
      .filter((id) => Number.isFinite(id) && id > 0);
    const objectives = (t.objectives as Json) ?? {};
    const killsOf = (key: string) => num(((objectives[key] as Json) ?? {}).kills);
    const firstOf = (key: string) => Boolean(((objectives[key] as Json) ?? {}).first);
    out[teamId] = {
      bans,
      dragon: killsOf("dragon"),
      baron: killsOf("baron"),
      tower: killsOf("tower"),
      inhibitor: killsOf("inhibitor"),
      riftHerald: killsOf("riftHerald"),
      atakhan: killsOf("atakhan"),
      horde: killsOf("horde"),
      firstBlood: firstOf("champion"),
      firstTower: firstOf("tower"),
      firstDragon: firstOf("dragon"),
      firstBaron: firstOf("baron"),
      firstInhibitor: firstOf("inhibitor"),
      firstRiftHerald: firstOf("riftHerald"),
      firstAtakhan: firstOf("atakhan"),
      firstHorde: firstOf("horde"),
    };
  }
  return Object.keys(out).length ? out : null;
}

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
    const multiKill = num(p.pentaKills) > 0
      ? "五杀"
      : num(p.quadraKills) > 0
        ? "四杀"
        : num(p.tripleKills) > 0
          ? "三杀"
          : num(p.doubleKills) > 0
            ? "双杀"
            : "";
    return {
      gameId,
      puuid,
      member: rosterNameByPuuid[puuid] ?? "",
      playerName: tag ? `${name}#${tag}` : String(name ?? ""),
      teamId: Number(p.teamId ?? 0),
      position: String(pick(p, "teamPosition", "individualPosition", "lane") ?? ""),
      champion: champNameMap[champId] ?? champId,
      championId: Number(champId) || 0,
      // BUG FIX (verified against real raw JSON, 5 saved matches checked):
      // this data source names these fields spell1Id/spell2Id, NOT
      // summoner1Id/summoner2Id (that's the official Match-V5 name, but
      // this SGP-derived response never has it) -- reading only
      // summoner1Id/summoner2Id meant spell1Id/spell2Id were always 0,
      // which is why summoner spell icons never rendered. summoner1Id/
      // summoner2Id are kept as a fallback in case a future response
      // shape uses that name instead.
      spell1Id: num(pick(p, "spell1Id", "summoner1Id")),
      spell2Id: num(pick(p, "spell2Id", "summoner2Id")),
      win: Boolean(p.win),
      score: rating.score,
      award: rating.award,
      kills,
      deaths,
      assists,
      kda,
      multiKill,
      firstBlood: Boolean(p.firstBloodKill),
      gold: num(p.goldEarned),
      damageToChampions: num(p.totalDamageDealtToChampions),
      physicalDamage: num(p.physicalDamageDealtToChampions),
      magicDamage: num(p.magicDamageDealtToChampions),
      trueDamage: num(p.trueDamageDealtToChampions),
      damageTaken: num(p.totalDamageTaken),
      heal: num(p.totalHeal),
      turretDamage: num(pick(p, "damageDealtToTurrets")),
      ccTime: num(p.timeCCingOthers),
      cs,
      visionScore: num(p.visionScore),
      wardsPlaced: num(p.wardsPlaced),
      wardsKilled: num(p.wardsKilled),
      champLevel: num(p.champLevel),
      items,
      damageSelfMitigated: num(p.damageSelfMitigated),
      killingSprees: num(p.killingSprees),
      largestKillingSpree: num(p.largestKillingSpree),
      objectivesStolen: num(p.objectivesStolen),
      healsOnTeammates: num(p.totalHealsOnTeammates),
      goldSpent: num(p.goldSpent),
      timeSpentDead: num(p.totalTimeSpentDead),
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
    teamStats: buildTeamStats(g),
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
