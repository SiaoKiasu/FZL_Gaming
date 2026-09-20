import "server-only";

import { sql } from "@vercel/postgres";
import { isDbConfigured } from "@/lib/db";
import { settlement, memberIdMap } from "@/lib/fund";

// Live version of the fund page's "排位数据统计" section — replaces the
// static all-zero placeholder in fund.ts with real numbers pulled from the
// synced matches/match_players tables (see src/lib/sgp.ts + src/lib/db.ts).
//
// Only 单双排/灵活组排 count toward 峡谷之巅 ("五黑排位"：车队五人整队同排，
// 即 roster_count = 5); 常驻嘉宾's "三人及以上任意模式" is any of the 5
// synced modes with roster_count >= 3. 天选之子（天命杯）、首席导播、名场面
// are internal team events / votes with no equivalent in match data, so
// they stay manually tracked in fund.ts.

const RANKED_QUEUE_NAMES = new Set(["单双排", "灵活组排"]);
const FULL_STACK_SIZE = 5; // "五黑" — 一整队都是车队成员
export const CANYON_PEAK_MIN_GAMES = 5; // 参评门槛：当月至少 5 局

// 峡谷之巅/常驻嘉宾 both explicitly read "当月"（this settlement month）in
// their rules (see fund.ts's awardRules/settlement comments), but this
// query used to have no date filter at all -- it summed every synced
// match ever, all-time, since the first sync. Scope it to settlement.month
// instead ("2026 年 9 月" etc -- the keeper bumps this string by hand each
// settlement cycle, so tying the filter to it rather than to wall-clock
// "now" keeps the live stats in lockstep with whatever period the rest of
// the page is showing). China has no DST, so Beijing-local month
// boundaries are just a fixed UTC+8 offset -- same trick beijingDateString
// uses for day boundaries in schedule.ts.
function fundMonthRangeMs(label: string): { startMs: number; endMs: number } {
  const m = /(\d+)\s*年\s*(\d+)\s*月/.exec(label);
  const now = new Date();
  const year = m ? Number(m[1]) : now.getUTCFullYear();
  const month = m ? Number(m[2]) : now.getUTCMonth() + 1; // 1-indexed
  return {
    startMs: Date.UTC(year, month - 1, 1, -8, 0, 0, 0),
    endMs: Date.UTC(year, month, 1, -8, 0, 0, 0),
  };
}

export type LiveMemberStat = {
  nickname: string; // 真实昵称（成员与缴费/群里叫法），如 "郑儿朗"
  gameId: string; // 游戏内 ID
  rankedGames: number; // 五黑排位局数（420/440 且 roster_count = 5）
  mvp: number;
  svp: number;
  mvpRate: number;
  svpRate: number;
  qualified: boolean; // 达到峡谷之巅参评门槛
  teamGames: number; // 三黑及以上 · 任意已同步模式局数（常驻嘉宾口径）
};

type Row = {
  member: string;
  queue_name: string;
  roster_count: number;
  award: string;
};

/** Live per-member breakdown for the fund page, or null if there's no DB
 * to read from (falls back to the static placeholder in that case). */
export async function getLiveMemberStats(): Promise<LiveMemberStat[] | null> {
  if (!isDbConfigured()) return null;

  const { startMs, endMs } = fundMonthRangeMs(settlement.month);
  const { rows } = await sql<Row>`
    SELECT mp.member, m.queue_name, m.roster_count, mp.award
    FROM match_players mp
    JOIN matches m ON m.game_id = mp.game_id
    WHERE mp.member <> '' AND m.game_creation_ms >= ${startMs} AND m.game_creation_ms < ${endMs}
  `;

  const byMember = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byMember.get(r.member);
    if (list) list.push(r);
    else byMember.set(r.member, [r]);
  }

  return memberIdMap.map((m) => {
    const games = byMember.get(m.gameId) ?? [];
    const rankedFullStack = games.filter(
      (g) => RANKED_QUEUE_NAMES.has(g.queue_name) && Number(g.roster_count) === FULL_STACK_SIZE
    );
    const rankedGames = rankedFullStack.length;
    const mvp = rankedFullStack.filter((g) => g.award === "MVP").length;
    const svp = rankedFullStack.filter((g) => g.award === "SVP").length;
    const teamGames = games.filter((g) => Number(g.roster_count) >= 3).length;

    return {
      nickname: m.nickname,
      gameId: m.gameId,
      rankedGames,
      mvp,
      svp,
      mvpRate: rankedGames ? mvp / rankedGames : 0,
      svpRate: rankedGames ? svp / rankedGames : 0,
      qualified: rankedGames >= CANYON_PEAK_MIN_GAMES,
      teamGames,
    };
  });
}
