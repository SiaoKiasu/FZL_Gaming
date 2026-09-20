import "server-only";

import { sql, db } from "@vercel/postgres";
import type { VercelPoolClient } from "@vercel/postgres";
import type { GameRecord, TeamStats } from "@/lib/sgp";

export type { TeamStats };

// Requires a Vercel Postgres store connected to this project (Storage tab
// in the Vercel dashboard — it wires up POSTGRES_URL etc. automatically).
// Run db/schema.sql once against it before the first sync, then
// db/schema_matches_detail.sql, db/schema_schedule.sql,
// db/schema_schedule_time.sql and db/schema_team_stats.sql once each to add
// the columns added since.
export function isDbConfigured(): boolean {
  return Boolean(process.env.POSTGRES_URL);
}

export async function getKnownGameIds(): Promise<Set<string>> {
  const { rows } = await sql<{ game_id: string }>`SELECT game_id FROM matches`;
  return new Set(rows.map((r) => r.game_id));
}

// One player row's column list, in the exact order both the multi-row
// INSERT and its ON CONFLICT UPDATE below rely on.
const MATCH_PLAYER_COLUMNS = [
  "game_id", "puuid", "member", "player_name", "team_id", "position", "champion", "champion_id",
  "spell1_id", "spell2_id", "win", "score", "award", "kills", "deaths", "assists", "kda", "multi_kill",
  "first_blood", "gold", "damage_to_champions", "physical_damage", "magic_damage", "true_damage",
  "damage_taken", "heal", "turret_damage", "cc_time", "cs", "vision_score", "wards_placed",
  "wards_killed", "champ_level", "items", "damage_self_mitigated", "killing_sprees",
  "largest_killing_spree", "objectives_stolen", "heals_on_teammates", "gold_spent", "time_spent_dead",
] as const;

function playerRowValues(gameId: string, p: GameRecord["players"][number]): unknown[] {
  return [
    gameId, p.puuid, p.member, p.playerName, p.teamId, p.position, p.champion, p.championId,
    p.spell1Id, p.spell2Id, p.win, p.score, p.award, p.kills, p.deaths, p.assists, p.kda, p.multiKill,
    p.firstBlood, p.gold, p.damageToChampions, p.physicalDamage, p.magicDamage, p.trueDamage,
    p.damageTaken, p.heal, p.turretDamage, p.ccTime, p.cs, p.visionScore, p.wardsPlaced,
    p.wardsKilled, p.champLevel, p.items, p.damageSelfMitigated, p.killingSprees,
    p.largestKillingSpree, p.objectivesStolen, p.healsOnTeammates, p.goldSpent, p.timeSpentDead,
  ];
}

// One multi-row INSERT for every player in a game, instead of one round
// trip per player. This is not just a speed-up -- it's the fix for a real
// data-corruption bug: with the old one-`await sql` per-player loop, if
// Vercel killed this route mid-request (maxDuration = 60s, and a big
// backlog sync can have 8 roster members x dozens of games x 10 players
// each to write), whichever game was mid-loop at that exact moment ended
// up with only SOME of its 10 players ever written -- e.g. only 1 of 5
// opponents stored, permanently, because that game's id was already in
// `matches` so later incremental syncs treat it as "already known" and
// never touch it again. Confirmed against the live site: a match whose
// page showed only 1 red-side player also summed its team totals (总击杀
// etc, computed server-side from all stored rows) to exactly that one
// player's own numbers -- proof the other 4 rows were never in the
// database at all, not just hidden by a display bug.
async function insertGamePlayers(
  client: VercelPoolClient,
  gameId: string,
  players: GameRecord["players"]
): Promise<void> {
  if (!players.length) return;
  const cols = MATCH_PLAYER_COLUMNS;
  const valuesSql: string[] = [];
  const params: unknown[] = [];
  players.forEach((p, i) => {
    const rowValues = playerRowValues(gameId, p);
    const placeholders = rowValues.map((_, j) => `$${i * cols.length + j + 1}`);
    valuesSql.push(`(${placeholders.join(", ")})`);
    params.push(...rowValues);
  });
  const updateSet = cols
    .slice(2) // skip game_id/puuid -- those are the conflict key, never updated
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");
  await client.query(
    `INSERT INTO match_players (${cols.join(", ")}) VALUES ${valuesSql.join(", ")}
     ON CONFLICT (game_id, puuid) DO UPDATE SET ${updateSet}`,
    params
  );
}

// Upserts on every sync (not just insert-if-new) so that a schema/rating
// change picks up existing games automatically the next time someone syncs
// -- there's no separate backfill step to remember to run.
//
// Each game's matches-row + all-its-players write is one DB transaction
// (BEGIN...COMMIT on a single checked-out connection) so a game is either
// fully stored or not stored at all -- never half-written. If the whole
// request gets killed mid-sync (see insertGamePlayers's comment above),
// Postgres rolls back whatever game's transaction was still open, and
// every game committed before that stays fully intact. A single game's
// insert failing (a genuinely malformed record) is logged and skipped
// rather than aborting the rest of the batch.
export async function insertGames(games: GameRecord[]): Promise<void> {
  const client = await db.connect();
  try {
    for (const g of games) {
      try {
        await client.query("BEGIN");
        const teamStatsJson = g.teamStats ? JSON.stringify(g.teamStats) : null;
        await client.query(
          `INSERT INTO matches (
            game_id, game_creation_ms, duration_min, queue_id, queue_name, game_mode, roster_count, team_stats
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (game_id) DO UPDATE SET
            game_creation_ms = EXCLUDED.game_creation_ms,
            duration_min = EXCLUDED.duration_min,
            queue_id = EXCLUDED.queue_id,
            queue_name = EXCLUDED.queue_name,
            game_mode = EXCLUDED.game_mode,
            roster_count = EXCLUDED.roster_count,
            team_stats = EXCLUDED.team_stats`,
          [g.gameId, g.gameCreationMs, g.durationMin, g.queueId, g.queueName, g.gameMode, g.rosterCount, teamStatsJson]
        );
        await insertGamePlayers(client, g.gameId, g.players);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        console.error(`[insertGames] failed to store game ${g.gameId}, skipping`, err);
      }
    }
  } finally {
    client.release();
  }
}

export type StoredPlayer = {
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
  multiKill: string;
  firstBlood: boolean;
  gold: number;
  damageToChampions: number;
  physicalDamage: number;
  magicDamage: number;
  trueDamage: number;
  damageTaken: number;
  heal: number;
  turretDamage: number;
  ccTime: number;
  cs: number;
  visionScore: number;
  wardsPlaced: number;
  wardsKilled: number;
  champLevel: number;
  items: string;
  damageSelfMitigated: number;
  killingSprees: number;
  largestKillingSpree: number;
  objectivesStolen: number;
  healsOnTeammates: number;
  goldSpent: number;
  timeSpentDead: number;
};

export type StoredMatch = {
  gameId: string;
  gameCreationMs: number;
  durationMin: number;
  queueName: string;
  rosterCount: number;
  players: StoredPlayer[];
  // Keyed by teamId string ("100"/"200"). Null for matches synced before
  // db/schema_team_stats.sql, until the next re-sync refreshes them.
  teamStats: Record<string, TeamStats> | null;
};

type PlayerRow = {
  member: string;
  player_name: string;
  team_id: number;
  position: string;
  champion: string;
  champion_id: number | null;
  spell1_id: number | null;
  spell2_id: number | null;
  win: boolean;
  score: number | null;
  award: string;
  kills: number;
  deaths: number;
  assists: number;
  kda: number | null;
  multi_kill: string | null;
  first_blood: boolean | null;
  gold: number;
  damage_to_champions: number;
  physical_damage: number | null;
  magic_damage: number | null;
  true_damage: number | null;
  damage_taken: number;
  heal: number;
  turret_damage: number | null;
  cc_time: number | null;
  cs: number;
  vision_score: number;
  wards_placed: number | null;
  wards_killed: number | null;
  champ_level: number;
  items: string;
  damage_self_mitigated: number | null;
  killing_sprees: number | null;
  largest_killing_spree: number | null;
  objectives_stolen: number | null;
  heals_on_teammates: number | null;
  gold_spent: number | null;
  time_spent_dead: number | null;
};

type MatchRow = {
  game_id: string;
  game_creation_ms: number;
  duration_min: number;
  queue_name: string;
  roster_count: number;
  team_stats: string | null;
} & PlayerRow;

// Old rows synced before db/schema_matches_detail.sql was added come back
// with NULLs for all the new columns -- default them out rather than
// showing "undefined"/NaN on older matches.
function toPlayer(r: PlayerRow): StoredPlayer {
  return {
    member: r.member,
    playerName: r.player_name,
    teamId: r.team_id,
    position: r.position,
    champion: r.champion,
    championId: Number(r.champion_id ?? 0),
    spell1Id: Number(r.spell1_id ?? 0),
    spell2Id: Number(r.spell2_id ?? 0),
    win: r.win,
    score: r.score === null ? null : Number(r.score),
    award: r.award,
    kills: r.kills,
    deaths: r.deaths,
    assists: r.assists,
    kda: r.kda === null ? null : Number(r.kda),
    multiKill: r.multi_kill ?? "",
    firstBlood: Boolean(r.first_blood),
    gold: Number(r.gold),
    damageToChampions: Number(r.damage_to_champions),
    physicalDamage: Number(r.physical_damage ?? 0),
    magicDamage: Number(r.magic_damage ?? 0),
    trueDamage: Number(r.true_damage ?? 0),
    damageTaken: Number(r.damage_taken),
    heal: Number(r.heal),
    turretDamage: Number(r.turret_damage ?? 0),
    ccTime: Number(r.cc_time ?? 0),
    cs: r.cs,
    visionScore: r.vision_score,
    wardsPlaced: Number(r.wards_placed ?? 0),
    wardsKilled: Number(r.wards_killed ?? 0),
    champLevel: r.champ_level,
    items: r.items,
    damageSelfMitigated: Number(r.damage_self_mitigated ?? 0),
    killingSprees: Number(r.killing_sprees ?? 0),
    largestKillingSpree: Number(r.largest_killing_spree ?? 0),
    objectivesStolen: Number(r.objectives_stolen ?? 0),
    healsOnTeammates: Number(r.heals_on_teammates ?? 0),
    goldSpent: Number(r.gold_spent ?? 0),
    timeSpentDead: Number(r.time_spent_dead ?? 0),
  };
}

function parseTeamStats(raw: string | null): Record<string, TeamStats> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, TeamStats>;
  } catch {
    return null;
  }
}

function groupMatches(rows: MatchRow[]): StoredMatch[] {
  const byGame = new Map<string, StoredMatch>();
  const order: string[] = [];
  for (const r of rows) {
    if (!byGame.has(r.game_id)) {
      byGame.set(r.game_id, {
        gameId: r.game_id,
        gameCreationMs: Number(r.game_creation_ms),
        durationMin: Number(r.duration_min),
        queueName: r.queue_name,
        rosterCount: r.roster_count,
        players: [],
        teamStats: parseTeamStats(r.team_stats),
      });
      order.push(r.game_id);
    }
    byGame.get(r.game_id)!.players.push(toPlayer(r));
  }
  return order.map((id) => byGame.get(id)!);
}

export async function listMatches(limit = 100): Promise<StoredMatch[]> {
  // One round trip: join match_players onto the most recent `limit` matches.
  // (Avoids passing an array param — @vercel/postgres's `sql` tag only
  // accepts primitive values, so the column list is spelled out below
  // rather than shared via a helper.)
  const { rows } = await sql<MatchRow>`
    SELECT m.game_id, m.game_creation_ms, m.duration_min, m.queue_name, m.roster_count, m.team_stats,
           mp.member, mp.player_name, mp.team_id, mp.position, mp.champion, mp.champion_id,
           mp.spell1_id, mp.spell2_id, mp.win, mp.score, mp.award, mp.kills, mp.deaths, mp.assists,
           mp.kda, mp.multi_kill, mp.first_blood, mp.gold, mp.damage_to_champions, mp.physical_damage,
           mp.magic_damage, mp.true_damage, mp.damage_taken, mp.heal, mp.turret_damage, mp.cc_time,
           mp.cs, mp.vision_score, mp.wards_placed, mp.wards_killed, mp.champ_level, mp.items,
           mp.damage_self_mitigated, mp.killing_sprees, mp.largest_killing_spree, mp.objectives_stolen,
           mp.heals_on_teammates, mp.gold_spent, mp.time_spent_dead
    FROM (
      SELECT game_id, game_creation_ms, duration_min, queue_name, roster_count, team_stats
      FROM matches
      ORDER BY game_creation_ms DESC
      LIMIT ${limit}
    ) m
    JOIN match_players mp ON mp.game_id = m.game_id
    ORDER BY m.game_creation_ms DESC, mp.team_id ASC
  `;
  return groupMatches(rows);
}

export async function getMatch(gameId: string): Promise<StoredMatch | null> {
  const { rows } = await sql<MatchRow>`
    SELECT m.game_id, m.game_creation_ms, m.duration_min, m.queue_name, m.roster_count, m.team_stats,
           mp.member, mp.player_name, mp.team_id, mp.position, mp.champion, mp.champion_id,
           mp.spell1_id, mp.spell2_id, mp.win, mp.score, mp.award, mp.kills, mp.deaths, mp.assists,
           mp.kda, mp.multi_kill, mp.first_blood, mp.gold, mp.damage_to_champions, mp.physical_damage,
           mp.magic_damage, mp.true_damage, mp.damage_taken, mp.heal, mp.turret_damage, mp.cc_time,
           mp.cs, mp.vision_score, mp.wards_placed, mp.wards_killed, mp.champ_level, mp.items,
           mp.damage_self_mitigated, mp.killing_sprees, mp.largest_killing_spree, mp.objectives_stolen,
           mp.heals_on_teammates, mp.gold_spent, mp.time_spent_dead
    FROM matches m
    JOIN match_players mp ON mp.game_id = m.game_id
    WHERE m.game_id = ${gameId}
    ORDER BY mp.team_id ASC
  `;
  const matches = groupMatches(rows);
  return matches[0] ?? null;
}

// ---- 峡谷基金收支流水 -----------------------------------------------
// entries live in the DB now (see db/schema_ledger.sql) instead of the
// static array in src/lib/fund.ts -- balance is a running SUM() computed
// at read time so entries never need to be re-numbered when one is added.

export type LedgerEntry = {
  id: number;
  date: string;
  type: string;
  item: string;
  income: number | null;
  expense: number | null;
  balance: number;
  handler: string;
};

type LedgerRow = {
  id: number;
  // The Postgres driver parses DATE columns (OID 1082) into native JS Date
  // objects, not strings -- despite this column being declared `string`
  // at the SQL-template-tag level. Rendering a raw Date directly in JSX
  // (`{entry.date}`) throws React's "Objects are not valid as a React
  // child" error, so every read path must coerce it with formatDateOnly().
  entry_date: string | Date;
  type: string;
  item: string;
  income: string | null;
  expense: string | null;
  handler: string;
  balance: string;
};

// Normalizes a DATE column value to a plain "YYYY-MM-DD" string. Handles
// both shapes defensively: a real Date object (the actual runtime type
// returned by @neondatabase/serverless for DATE columns) and a string
// (in case a future driver version or query path returns one directly).
function formatDateOnly(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

export async function getLedgerEntries(): Promise<LedgerEntry[]> {
  try {
    const { rows } = await sql<LedgerRow>`
      SELECT id, entry_date, type, item, income, expense, handler,
             SUM(COALESCE(income, 0) - COALESCE(expense, 0)) OVER (ORDER BY entry_date, id) AS balance
      FROM ledger_entries
      ORDER BY entry_date ASC, id ASC
    `;
    return rows.map((r) => ({
      id: r.id,
      date: formatDateOnly(r.entry_date),
      type: r.type,
      item: r.item,
      income: r.income === null ? null : Number(r.income),
      expense: r.expense === null ? null : Number(r.expense),
      balance: Number(r.balance),
      handler: r.handler,
    }));
  } catch {
    // db/schema_ledger.sql hasn't been run against this database yet --
    // treat "table doesn't exist" the same as "no entries yet" so the
    // fund page still renders (with its static fallback) instead of
    // crashing the whole route on a migration that's simply pending.
    return [];
  }
}

export type LedgerEntryInput = {
  date: string;
  type: string;
  item: string;
  income: number | null;
  expense: number | null;
  handler: string;
};

export async function insertLedgerEntry(entry: LedgerEntryInput): Promise<void> {
  await sql`
    INSERT INTO ledger_entries (entry_date, type, item, income, expense, handler)
    VALUES (${entry.date}, ${entry.type}, ${entry.item}, ${entry.income}, ${entry.expense}, ${entry.handler})
  `;
}

const LEDGER_PASSWORD_KEY = "ledger_password_hash";

export async function getLedgerPasswordHash(): Promise<string | null> {
  try {
    const { rows } = await sql<{ value: string }>`
      SELECT value FROM app_settings WHERE key = ${LEDGER_PASSWORD_KEY}
    `;
    return rows[0]?.value ?? null;
  } catch {
    // Same reasoning as getLedgerEntries() -- app_settings may not exist
    // yet if the migration hasn't run.
    return null;
  }
}

// One-time claim: only succeeds while no password has been set yet, so
// this can only ever be used once (by whoever opens the setup form
// first -- meant to be 喑糖浆, before anyone else gets to it). Returns
// false if a password was already set (setup already claimed).
export async function setLedgerPasswordIfAbsent(hash: string): Promise<boolean> {
  const { rowCount } = await sql`
    INSERT INTO app_settings (key, value) VALUES (${LEDGER_PASSWORD_KEY}, ${hash})
    ON CONFLICT (key) DO NOTHING
  `;
  return (rowCount ?? 0) > 0;
}

export async function updateLedgerPassword(hash: string): Promise<void> {
  await sql`
    INSERT INTO app_settings (key, value) VALUES (${LEDGER_PASSWORD_KEY}, ${hash})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}

