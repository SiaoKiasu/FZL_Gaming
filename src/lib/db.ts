import "server-only";

import { sql } from "@vercel/postgres";
import type { GameRecord } from "@/lib/sgp";

// Requires a Vercel Postgres store connected to this project (Storage tab
// in the Vercel dashboard — it wires up POSTGRES_URL etc. automatically).
// Run db/schema.sql once against it before the first sync.
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
          game_id, puuid, member, player_name, team_id, position, champion, win,
          score, award, kills, deaths, assists, kda, gold, damage_to_champions,
          damage_taken, heal, cs, vision_score, champ_level, items
        ) VALUES (
          ${g.gameId}, ${p.puuid}, ${p.member}, ${p.playerName}, ${p.teamId}, ${p.position}, ${p.champion}, ${p.win},
          ${p.score}, ${p.award}, ${p.kills}, ${p.deaths}, ${p.assists}, ${p.kda}, ${p.gold}, ${p.damageToChampions},
          ${p.damageTaken}, ${p.heal}, ${p.cs}, ${p.visionScore}, ${p.champLevel}, ${p.items}
        )
        ON CONFLICT (game_id, puuid) DO NOTHING
      `;
    }
  }
}

export type StoredMatch = {
  gameId: string;
  gameCreationMs: number;
  durationMin: number;
  queueName: string;
  rosterCount: number;
  players: {
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
    cs: number;
    visionScore: number;
    items: string;
  }[];
};

export async function listMatches(limit = 100): Promise<StoredMatch[]> {
  // One round trip: join match_players onto the most recent `limit` matches.
  // (Avoids passing an array param — @vercel/postgres's `sql` tag only
  // accepts primitive values.)
  const { rows } = await sql<{
    game_id: string;
    game_creation_ms: number;
    duration_min: number;
    queue_name: string;
    roster_count: number;
    member: string;
    player_name: string;
    team_id: number;
    position: string;
    champion: string;
    win: boolean;
    score: number | null;
    award: string;
    kills: number;
    deaths: number;
    assists: number;
    kda: number | null;
    cs: number;
    vision_score: number;
    items: string;
  }>`
    SELECT m.game_id, m.game_creation_ms, m.duration_min, m.queue_name, m.roster_count,
           mp.member, mp.player_name, mp.team_id, mp.position, mp.champion, mp.win,
           mp.score, mp.award, mp.kills, mp.deaths, mp.assists, mp.kda, mp.cs, mp.vision_score, mp.items
    FROM (
      SELECT game_id, game_creation_ms, duration_min, queue_name, roster_count
      FROM matches
      ORDER BY game_creation_ms DESC
      LIMIT ${limit}
    ) m
    JOIN match_players mp ON mp.game_id = m.game_id
    ORDER BY m.game_creation_ms DESC, mp.team_id ASC
  `;

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
    byGame.get(r.game_id)!.players.push({
      member: r.member,
      playerName: r.player_name,
      teamId: r.team_id,
      position: r.position,
      champion: r.champion,
      win: r.win,
      score: r.score === null ? null : Number(r.score),
      award: r.award,
      kills: r.kills,
      deaths: r.deaths,
      assists: r.assists,
      kda: r.kda === null ? null : Number(r.kda),
      cs: r.cs,
      visionScore: r.vision_score,
      items: r.items,
    });
  }
  return order.map((id) => byGame.get(id)!);
}
