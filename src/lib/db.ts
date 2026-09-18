import "server-only";

import { sql } from "@vercel/postgres";
import type { GameRecord } from "@/lib/sgp";

// Requires a Vercel Postgres store connected to this project (Storage tab
// in the Vercel dashboard — it wires up POSTGRES_URL etc. automatically).
// Run db/schema.sql once against it before the first sync, and
// db/schema_matches_detail.sql once to add the extra per-player columns
// used by the match detail page.
export function isDbConfigured(): boolean {
  return Boolean(process.env.POSTGRES_URL);
}

export async function getKnownGameIds(): Promise<Set<string>> {
  const { rows } = await sql<{ game_id: string }>`SELECT game_id FROM matches`;
  return new Set(rows.map((r) => r.game_id));
}

export async function insertGames(games: GameRecord[]): Promise<void> {
  for (const g of games) {
    await sql`
      INSERT INTO matches (game_id, game_creation_ms, duration_min, queue_id, queue_name, game_mode, roster_count)
      VALUES (${g.gameId}, ${g.gameCreationMs}, ${g.durationMin}, ${g.queueId}, ${g.queueName}, ${g.gameMode}, ${g.rosterCount})
      ON CONFLICT (game_id) DO NOTHING
    `;
    for (const p of g.players) {
      await sql`
        INSERT INTO match_players (
          game_id, puuid, member, player_name, team_id, position, champion, champion_id,
          spell1_id, spell2_id, win, score, award, kills, deaths, assists, kda, multi_kill,
          first_blood, gold, damage_to_champions, physical_damage, magic_damage, true_damage,
          damage_taken, heal, turret_damage, cc_time, cs, vision_score, wards_placed,
          wards_killed, champ_level, items
        ) VALUES (
          ${g.gameId}, ${p.puuid}, ${p.member}, ${p.playerName}, ${p.teamId}, ${p.position}, ${p.champion}, ${p.championId},
          ${p.spell1Id}, ${p.spell2Id}, ${p.win}, ${p.score}, ${p.award}, ${p.kills}, ${p.deaths}, ${p.assists}, ${p.kda}, ${p.multiKill},
          ${p.firstBlood}, ${p.gold}, ${p.damageToChampions}, ${p.physicalDamage}, ${p.magicDamage}, ${p.trueDamage},
          ${p.damageTaken}, ${p.heal}, ${p.turretDamage}, ${p.ccTime}, ${p.cs}, ${p.visionScore}, ${p.wardsPlaced},
          ${p.wardsKilled}, ${p.champLevel}, ${p.items}
        )
        ON CONFLICT (game_id, puuid) DO NOTHING
      `;
    }
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
};

export type StoredMatch = {
  gameId: string;
  gameCreationMs: number;
  durationMin: number;
  queueName: string;
  rosterCount: number;
  players: StoredPlayer[];
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
};

type MatchRow = {
  game_id: string;
  game_creation_ms: number;
  duration_min: number;
  queue_name: string;
  roster_count: number;
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
  };
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
    SELECT m.game_id, m.game_creation_ms, m.duration_min, m.queue_name, m.roster_count,
           mp.member, mp.player_name, mp.team_id, mp.position, mp.champion, mp.champion_id,
           mp.spell1_id, mp.spell2_id, mp.win, mp.score, mp.award, mp.kills, mp.deaths, mp.assists,
           mp.kda, mp.multi_kill, mp.first_blood, mp.gold, mp.damage_to_champions, mp.physical_damage,
           mp.magic_damage, mp.true_damage, mp.damage_taken, mp.heal, mp.turret_damage, mp.cc_time,
           mp.cs, mp.vision_score, mp.wards_placed, mp.wards_killed, mp.champ_level, mp.items
    FROM (
      SELECT game_id, game_creation_ms, duration_min, queue_name, roster_count
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
    SELECT m.game_id, m.game_creation_ms, m.duration_min, m.queue_name, m.roster_count,
           mp.member, mp.player_name, mp.team_id, mp.position, mp.champion, mp.champion_id,
           mp.spell1_id, mp.spell2_id, mp.win, mp.score, mp.award, mp.kills, mp.deaths, mp.assists,
           mp.kda, mp.multi_kill, mp.first_blood, mp.gold, mp.damage_to_champions, mp.physical_damage,
           mp.magic_damage, mp.true_damage, mp.damage_taken, mp.heal, mp.turret_damage, mp.cc_time,
           mp.cs, mp.vision_score, mp.wards_placed, mp.wards_killed, mp.champ_level, mp.items
    FROM matches m
    JOIN match_players mp ON mp.game_id = m.game_id
    WHERE m.game_id = ${gameId}
    ORDER BY mp.team_id ASC
  `;
  const matches = groupMatches(rows);
  return matches[0] ?? null;
}
