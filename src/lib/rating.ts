// v3 match rating. Ported from lol_ranked_sync/rating.py (v3, 2026-09-23) --
// keep the two in sync if anything here changes. Design and every number
// below were settled against 1272 ranked + 4620 Hextech Mayhem games; see the
// notes in lol_ranked_sync/CHANGELOG.md for the evidence.
//
// The shape follows 掌盟's published MVP/SVP rules: pick the mode, identify
// the role actually played, weight the dimensions that role is responsible
// for, then compare against the historical distribution of that same role
// (横向对比). The old v2 min-max normalised inside each single game across
// all 10 players, which structurally starved supports of MVPs (3.6% vs an
// unbiased 20%) because their metrics can never top a carry's. v3 compares
// a support with supports.
//
// This module is pure: no I/O, no server-only import. Baselines are passed
// in; src/lib/ratingBaseline.ts is what builds them from the prior + DB.

import PRIOR_JSON from "@/data/rating_v3_prior.json";
import CHAMPION_TAGS from "@/data/champion_tags.json";
import ITEM_META from "@/data/item_meta.json";

type Json = Record<string, unknown>;

// ---------------------------------------------------------------- dims
// Each dimension is a weighted mean of a few metric z-scores. Metrics were
// filtered by 对位胜率 (does the higher of the two lane opponents win more):
// absolute per-minute rates carry that signal, team-share metrics don't --
// shares stay in only where they measure in-team contribution (输出/参团).
// Mayhem has no timeline (SGP has no DETAILS for it), so its dimensions stay
// on SUMMARY metrics only. Summoner's Rift adds the tl_* metrics computed
// from the match timeline by computeTimelineMetrics(); a row that lacks
// them (timeline not fetched yet) simply skips those metrics -- see rawZ.
export const DIMS_MAYHEM: Record<string, Record<string, number>> = {
  对线: { ch_laningPhaseGoldExpAdvantage: 1, ch_maxLevelLeadLaneOpponent: 1, ch_turretPlatesTaken: 1, ch_soloKills: 0.6 },
  发育: { ch_goldPerMinute: 1, xp_pm: 1, cs_pm: 0.7 },
  输出: { ch_damagePerMinute: 1, d_dmg_share: 0.8, d_dmg_per_gold: 0.6 },
  承伤: { d_taken_share: 1, mit_pm: 1, ch_tookLargeDamageSurvived: 0.4 },
  控制: { ch_pickKillWithAlly: 1, ch_immobilizeAndKillWithAlly: 0.8, cc_pm: 0.6 },
  资源: { obj_pm: 1, epic_td: 1, ejg_pm: 0.6 },
  节奏: { ch_scuttleCrabKills: 0.6, ch_buffsStolen: 0.5, ch_jungleCsBefore10Minutes: 0.6, ch_killsOnLanersEarlyJungleAsJungler: 1, ch_takedownsFirstXMinutes: 1 },
  参团: { td_pm: 1, d_kp: 0.8, ch_takedownsFirstXMinutes: 0.5 },
  保护: { heal_shield_pm: 1, ch_saveAllyFromDeath: 0.8 },
  推进: { turret_pm: 1, turretTakedowns: 0.8, ch_kTurretsDestroyedBeforePlatesFall: 0.4 },
  视野: { ch_visionScorePerMinute: 1, ch_controlWardsPlaced: 0.6, ch_wardTakedowns: 0.5, ch_visionScoreAdvantageLaneOpponent: 0.6 },
  生存: { neg_deaths_pm: 1, kda_cap: 0.8, neg_dead_pm: 0.5 },
};

export const DIMS_SR: Record<string, Record<string, number>> = {
  ...DIMS_MAYHEM,
  资源: { ...DIMS_MAYHEM["资源"], tl_obj_part_rate: 0.8 },
  参团: { ...DIMS_MAYHEM["参团"], tl_roam_td: 0.5 },
  生存: { ...DIMS_MAYHEM["生存"], tl_neg_deaths_pre15: 0.5 },
  // 团战: survival in fights, share of the team's fight kills, initiating a
  // fight the team then won, and being there for objectives. Correlates ~0.74
  // with 参团 (players who fight well also participate a lot) -- in line with
  // other dimension pairs (对线↔发育 0.72), so kept as its own axis.
  团战: { tl_tf_survive: 1, tl_tf_kp2: 0.6, tl_opener_won: 0.6, tl_obj_part_rate: 0.4 },
};

const DIMS_BY_MODE: Record<string, Record<string, Record<string, number>>> = { sr: DIMS_SR, mayhem: DIMS_MAYHEM };

/** Every metric any dimension reads. Also the whitelist ratingBaseline.ts
 *  interpolates into SQL, so it must stay a closed set of plain identifiers. */
export const METRIC_KEYS: readonly string[] = Array.from(
  new Set([...Object.values(DIMS_SR), ...Object.values(DIMS_MAYHEM)].flatMap((d) => Object.keys(d)))
).sort();

// ---------------------------------------------------------------- weights
// Summoner's Rift, per position. Follows the "本局重点观察" list on page 3
// of 掌盟's rule sheet; each row sums to 1.
const W_SR: Record<string, Record<string, number>> = {
  TOP: { 对线: 0.16, 输出: 0.14, 承伤: 0.14, 参团: 0.10, 团战: 0.10, 控制: 0.10, 推进: 0.12, 发育: 0.06, 生存: 0.08 },
  JUNGLE: { 节奏: 0.12, 资源: 0.18, 参团: 0.14, 团战: 0.10, 输出: 0.12, 视野: 0.08, 控制: 0.10, 承伤: 0.06, 生存: 0.10 },
  MIDDLE: { 对线: 0.16, 输出: 0.18, 发育: 0.10, 参团: 0.12, 团战: 0.10, 控制: 0.08, 资源: 0.06, 推进: 0.06, 生存: 0.08, 视野: 0.06 },
  BOTTOM: { 发育: 0.14, 输出: 0.20, 对线: 0.14, 参团: 0.12, 团战: 0.10, 推进: 0.08, 资源: 0.06, 生存: 0.10, 控制: 0.06 },
  UTILITY: { 控制: 0.20, 保护: 0.14, 参团: 0.14, 团战: 0.12, 视野: 0.18, 生存: 0.08, 承伤: 0.06, 资源: 0.04, 对线: 0.04 },
};
// Hextech Mayhem has no lanes, so the role comes from champion class +
// what was actually built (page 5 of the rule sheet).
const W_MAYHEM: Record<string, Record<string, number>> = {
  坦克: { 承伤: 0.30, 控制: 0.25, 参团: 0.15, 输出: 0.10, 生存: 0.10, 推进: 0.10 },
  战士: { 输出: 0.30, 承伤: 0.15, 参团: 0.15, 控制: 0.10, 生存: 0.15, 推进: 0.15 },
  输出: { 输出: 0.40, 参团: 0.15, 生存: 0.15, 控制: 0.10, 推进: 0.15, 承伤: 0.05 },
  辅助: { 保护: 0.30, 控制: 0.20, 参团: 0.15, 生存: 0.15, 输出: 0.10, 推进: 0.10 },
};

/** Canonical display order for dimensions (radar axes, legends). */
export const DIM_ORDER = ["对线", "发育", "输出", "承伤", "控制", "资源", "节奏", "参团", "团战", "保护", "推进", "视野", "生存"] as const;

/** The dimensions a role is actually graded on, in display order. */
export function dimsForGroup(group: string): string[] {
  const [mode, role] = group.split("|");
  const w = (mode === "sr" ? W_SR : W_MAYHEM)[role];
  return w ? DIM_ORDER.filter((d) => d in w) : [];
}

const SR_QUEUES = new Set([420, 440, 400, 490]);
const MAYHEM_QUEUES = new Set([2400, 450]);
const SR_POSITIONS = new Set(Object.keys(W_SR));

// ---------------------------------------------------------------- metrics
export type PlayerMetrics = {
  puuid: string;
  teamId: number;
  win: boolean;
  position: string;
  queueId: number;
  championId: number;
  /** "sr|TOP", "mayhem|坦克", or null when the row can't be rated. */
  group: string | null;
  /** Share of item gold spent on tank stats, 0..1; 0.5 when nothing built. */
  tankIdx: number;
  metrics: Record<string, number>;
};

function num(x: unknown): number {
  const n = typeof x === "number" ? x : parseFloat(String(x ?? 0));
  return Number.isFinite(n) ? n : 0;
}

const champTags = CHAMPION_TAGS as Record<string, string[]>;
// [gold, tankTagCount, damageTagCount, totalTagCount] per item id; only items
// carrying at least one tank or damage stat are listed (see item_meta.json).
const itemMeta = ITEM_META as unknown as Record<string, [number, number, number, number]>;

function tankIndex(itemIds: number[]): number {
  let t = 0;
  let d = 0;
  for (const id of itemIds) {
    const m = itemMeta[String(id)];
    if (!m) continue;
    const [gold, tk, dm, total] = m;
    if (tk) t += (gold * tk) / Math.max(total, 1);
    if (dm) d += (gold * dm) / Math.max(total, 1);
  }
  return t + d > 0 ? t / (t + d) : 0.5;
}

function mayhemRole(tags: string[], tankIdx: number, healShieldPm: number): string {
  if (healShieldPm > 60 && tags.includes("Support")) return "辅助";
  if (tankIdx > 0.55 || (tags.includes("Tank") && tankIdx > 0.35)) return "坦克";
  if (tags.includes("Fighter") && tankIdx > 0.2) return "战士";
  return "输出";
}

/**
 * Turns one game's raw participants into the metric rows the rating reads.
 * Pure and deterministic, so the same JSON always yields the same metrics --
 * this is what gets persisted in match_players.metrics, and what the
 * baselines are fitted from.
 */
export function computeGameMetrics(game: Json, participants: Json[]): PlayerMetrics[] {
  const queueId = num(game.queueId);
  const dMin = Math.max(num(game.gameDuration ?? game.gameLength) / 60, 1);
  const team = new Map<number, { kills: number; dmg: number; taken: number }>();
  for (const p of participants) {
    const t = team.get(num(p.teamId)) ?? { kills: 0, dmg: 0, taken: 0 };
    t.kills += num(p.kills);
    t.dmg += num(p.totalDamageDealtToChampions);
    t.taken += num(p.totalDamageTaken);
    team.set(num(p.teamId), t);
  }

  return participants.map((p) => {
    const ch = (p.challenges as Json) ?? {};
    const c = (k: string) => num(ch[k]);
    const t = team.get(num(p.teamId)) ?? { kills: 0, dmg: 0, taken: 0 };
    const pm = (v: number) => v / dMin;
    const items = Array.from({ length: 7 }, (_, i) => num(p[`item${i}`]));
    const tankIdx = tankIndex(items);
    const healShieldPm = pm(num(p.totalHealsOnTeammates) + num(p.totalDamageShieldedOnTeammates) + c("effectiveHealAndShielding"));
    const m: Record<string, number> = {
      ch_laningPhaseGoldExpAdvantage: c("laningPhaseGoldExpAdvantage"),
      ch_maxLevelLeadLaneOpponent: c("maxLevelLeadLaneOpponent"),
      ch_turretPlatesTaken: c("turretPlatesTaken"),
      ch_soloKills: c("soloKills"),
      ch_goldPerMinute: c("goldPerMinute"),
      xp_pm: pm(num(p.champExperience)),
      cs_pm: pm(num(p.totalMinionsKilled) + num(p.neutralMinionsKilled)),
      ch_damagePerMinute: c("damagePerMinute"),
      d_dmg_share: num(p.totalDamageDealtToChampions) / Math.max(t.dmg, 1),
      d_dmg_per_gold: num(p.totalDamageDealtToChampions) / Math.max(num(p.goldEarned), 1),
      d_taken_share: num(p.totalDamageTaken) / Math.max(t.taken, 1),
      mit_pm: pm(num(p.damageSelfMitigated)),
      ch_tookLargeDamageSurvived: c("tookLargeDamageSurvived"),
      ch_pickKillWithAlly: c("pickKillWithAlly"),
      ch_immobilizeAndKillWithAlly: c("immobilizeAndKillWithAlly"),
      cc_pm: pm(num(p.timeCCingOthers)),
      obj_pm: pm(num(p.damageDealtToObjectives)),
      epic_td: c("dragonTakedowns") + c("baronTakedowns") + c("riftHeraldTakedowns") + c("voidMonsterKill"),
      ejg_pm: pm(num(p.totalEnemyJungleMinionsKilled)),
      ch_scuttleCrabKills: c("scuttleCrabKills"),
      ch_buffsStolen: c("buffsStolen"),
      ch_jungleCsBefore10Minutes: c("jungleCsBefore10Minutes"),
      ch_killsOnLanersEarlyJungleAsJungler: c("killsOnLanersEarlyJungleAsJungler"),
      ch_takedownsFirstXMinutes: c("takedownsFirstXMinutes"),
      td_pm: pm(num(p.kills) + num(p.assists)),
      d_kp: (num(p.kills) + num(p.assists)) / Math.max(t.kills, 1),
      heal_shield_pm: healShieldPm,
      ch_saveAllyFromDeath: c("saveAllyFromDeath"),
      turret_pm: pm(num(p.damageDealtToTurrets)),
      turretTakedowns: num(p.turretTakedowns),
      ch_kTurretsDestroyedBeforePlatesFall: c("kTurretsDestroyedBeforePlatesFall"),
      ch_visionScorePerMinute: c("visionScorePerMinute"),
      ch_controlWardsPlaced: c("controlWardsPlaced"),
      ch_wardTakedowns: c("wardTakedowns"),
      ch_visionScoreAdvantageLaneOpponent: c("visionScoreAdvantageLaneOpponent"),
      neg_deaths_pm: -pm(num(p.deaths)),
      kda_cap: Math.min(c("kda"), 10),
      neg_dead_pm: -pm(num(p.totalTimeSpentDead)),
    };

    const position = String(p.teamPosition ?? "");
    const championId = num(p.championId);
    const tags = champTags[String(championId)] ?? [];
    let group: string | null = null;
    if (SR_QUEUES.has(queueId) && SR_POSITIONS.has(position)) group = `sr|${position}`;
    else if (MAYHEM_QUEUES.has(queueId)) group = `mayhem|${mayhemRole(tags, tankIdx, healShieldPm)}`;

    return {
      puuid: String(p.puuid ?? ""),
      teamId: num(p.teamId),
      win: Boolean(p.win),
      position,
      queueId,
      championId,
      group,
      tankIdx,
      metrics: m,
    };
  });
}

// ---------------------------------------------------------------- timeline
export type TimelineJson = {
  participants?: { participantId: number; puuid: string }[];
  frames?: {
    events?: Json[];
    participantFrames?: Record<string, { position?: { x: number; y: number } } & Json>;
  }[];
};

type XY = { x: number; y: number };
const MIN_MS = 60000;
const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
// Map thirds: y - x > 3500 is the top-side band, < -3500 bottom-side, else mid.
const band = (p: XY) => (p.y - p.x > 3500 ? "TOP" : p.y - p.x < -3500 ? "BOTTOM" : "MIDDLE");
const involved = (e: Json): Set<number> => {
  const s = new Set<number>([num(e.killerId), num(e.victimId), ...((e.assistingParticipantIds as number[]) ?? [])]);
  s.delete(0);
  return s;
};
// Round-half-up to the nearest one-minute frame (kept identical in rating.py).
const frameAt = (ts: number, nf: number) => Math.min(Math.floor((ts + 30000) / MIN_MS), nf - 1);

/**
 * The six timeline metrics the SR dimensions read. Same definitions and
 * thresholds as rating.py's compute_timeline_metrics -- the two are
 * parity-tested against each other on 1272 games.
 *
 *   tl_tf_survive       share of the player's teamfights they didn't die in
 *   tl_tf_kp2           player's teamfight takedowns / ALL of the team's teamfight kills
 *   tl_opener_won       teamfights where the player landed the first hit on the first victim AND the team won the fight
 *   tl_obj_part_rate    share of the team's monsters/buildings the player took part in or stood within 3500 of
 *   tl_roam_td          takedowns before 15:00 outside the player's own lane band (laners only)
 *   tl_neg_deaths_pre15 minus deaths before 15:00
 *
 * A teamfight is a cluster of kills ≤15s and ≤3000 units apart with ≥2 kills
 * and ≥3 distinct players involved.
 */
export function computeTimelineMetrics(
  players: { puuid: string; teamId: number; position: string }[],
  timeline: TimelineJson
): Record<string, Record<string, number>> {
  // Accept the raw DETAILS envelope ({ metadata, json: { frames } }) as well
  // as the inner object -- the fit scripts read files, fetchTimeline unwraps.
  const inner = (timeline as { json?: TimelineJson }).json;
  if (!timeline.frames && inner?.frames) timeline = inner;
  const frames = timeline.frames ?? [];
  const nf = frames.length;
  const out: Record<string, Record<string, number>> = {};
  if (!nf) return out;
  const pidOf = new Map((timeline.participants ?? []).map((p) => [p.puuid, p.participantId]));
  const teamOf = new Map<number, number>();
  const posOf = new Map<number, string>();
  for (const p of players) {
    const pid = pidOf.get(p.puuid);
    if (pid !== undefined) {
      teamOf.set(pid, p.teamId);
      posOf.set(pid, p.position);
    }
  }
  const pf = (i: number, pid: number) => frames[Math.min(i, nf - 1)].participantFrames?.[String(pid)];
  const ev = frames.flatMap((f) => f.events ?? []);
  const kills = ev.filter((e) => e.type === "CHAMPION_KILL").sort((a, b) => num(a.timestamp) - num(b.timestamp));
  const fights: Json[][] = [];
  for (const e of kills) {
    const last = fights.length ? fights[fights.length - 1] : null;
    const prev = last ? last[last.length - 1] : null;
    if (prev && num(e.timestamp) - num(prev.timestamp) <= 15000 && dist(e.position as XY, prev.position as XY) <= 3000) last!.push(e);
    else fights.push([e]);
  }
  const teamfights = fights.filter((f) => {
    if (f.length < 2) return false;
    const all = new Set<number>();
    for (const e of f) for (const x of involved(e)) all.add(x);
    return all.size >= 3;
  });
  const objs = ev.filter((e) => e.type === "ELITE_MONSTER_KILL" || e.type === "BUILDING_KILL");
  const isAssist = (e: Json, pid: number) => ((e.assistingParticipantIds as number[]) ?? []).includes(pid);

  for (const p of players) {
    const pid = pidOf.get(p.puuid);
    if (pid === undefined) continue;
    const team = teamOf.get(pid)!;
    const pos = posOf.get(pid) ?? "";
    const myK = kills.filter((e) => num(e.killerId) === pid || isAssist(e, pid));
    const myD = kills.filter((e) => num(e.victimId) === pid);
    const tfIn = teamfights.filter((f) => f.some((e) => involved(e).has(pid)));
    const teamTf = teamfights.filter((f) => f.some((e) => [...involved(e)].some((x) => teamOf.get(x) === team)));
    let teamTfKills = 0;
    for (const f of teamTf) for (const e of f) if (teamOf.get(num(e.killerId)) === team) teamTfKills++;
    let kpNum = 0;
    let tfDeaths = 0;
    let openerWon = 0;
    for (const f of tfIn) {
      let mine = 0;
      for (const e of f) if (teamOf.get(num(e.killerId)) === team) mine++;
      const theirs = f.length - mine;
      for (const e of f) {
        if (num(e.killerId) === pid || isAssist(e, pid)) kpNum++;
        if (num(e.victimId) === pid) tfDeaths++;
      }
      const recv = (f[0].victimDamageReceived as Json[]) ?? [];
      if (recv.length && num(recv[0].participantId) === pid && mine > theirs) openerWon++;
    }
    const myObjs = objs.filter((e) =>
      e.type === "ELITE_MONSTER_KILL"
        ? (e.killerTeamId !== undefined && e.killerTeamId !== null ? num(e.killerTeamId) : teamOf.get(num(e.killerId))) === team
        : num(e.teamId) !== team && num(e.killerId) !== 0
    );
    let part = 0;
    for (const e of myObjs) {
      if (involved(e).has(pid)) {
        part++;
        continue;
      }
      const at = pf(frameAt(num(e.timestamp), nf), pid)?.position;
      if (at && dist(at, e.position as XY) <= 3500) part++;
    }
    const laner = pos === "TOP" || pos === "MIDDLE" || pos === "BOTTOM" || pos === "UTILITY";
    const ownBand = pos === "UTILITY" ? "BOTTOM" : pos;
    const roam = laner ? myK.filter((e) => num(e.timestamp) < 15 * MIN_MS && band(e.position as XY) !== ownBand).length : 0;
    out[p.puuid] = {
      tl_tf_survive: tfIn.length ? 1 - tfDeaths / tfIn.length : 0,
      tl_tf_kp2: teamTfKills ? kpNum / teamTfKills : 0,
      tl_opener_won: openerWon,
      tl_obj_part_rate: myObjs.length ? part / myObjs.length : 0,
      tl_roam_td: roam,
      tl_neg_deaths_pre15: -myD.filter((e) => num(e.timestamp) < 15 * MIN_MS).length,
    };
  }
  return out;
}

/** Merges timeline metrics into rows from computeGameMetrics (in place). */
export function attachTimeline(rows: PlayerMetrics[], timeline: TimelineJson): PlayerMetrics[] {
  const tl = computeTimelineMetrics(rows.map((r) => ({ puuid: r.puuid, teamId: r.teamId, position: r.position })), timeline);
  for (const r of rows) Object.assign(r.metrics, tl[r.puuid] ?? {});
  return rows;
}

/** True when a stored metrics map already carries the timeline block. */
export const HAS_TIMELINE_KEY = "tl_tf_survive";

// ---------------------------------------------------------------- baseline
export type GroupBaseline = {
  n: number;
  metrics: Record<string, { med: number; scale: number }>;
  z_mean: number;
  z_sd: number;
  tank_idx_median: number;
  z_by_outcome: Record<"win" | "loss", { mean: number; sd: number }>;
};
export type Baseline = Record<string, GroupBaseline>;

export const PRIOR_BASELINE: Baseline = (PRIOR_JSON as { groups: Baseline }).groups;

/**
 * Blends the shipped prior with what the database has actually seen,
 * weighting each by sample count -- so day one runs on the prior alone and
 * the live data takes over as it accumulates, with no switch to flip.
 * `live` carries only the metric quantiles (that's all one SQL query can
 * give); standardisation stats come from `prior` unless `zstats` overrides.
 */
export function mergeBaselines(
  prior: Baseline,
  live: Record<string, { n: number; metrics: Record<string, { med: number; scale: number }> }>,
  zstats?: Record<string, Pick<GroupBaseline, "z_mean" | "z_sd" | "z_by_outcome" | "tank_idx_median">>
): Baseline {
  const out: Baseline = {};
  for (const [g, p] of Object.entries(prior)) {
    const l = live[g];
    const metrics: GroupBaseline["metrics"] = {};
    for (const k of METRIC_KEYS) {
      const pm = p.metrics[k] ?? { med: 0, scale: 1 };
      const lm = l?.metrics[k];
      if (!lm || l.n <= 0) {
        metrics[k] = pm;
        continue;
      }
      const w = l.n / (l.n + p.n);
      metrics[k] = {
        med: pm.med * (1 - w) + lm.med * w,
        // A degenerate live spread (every row identical) falls back to the prior's.
        scale: lm.scale > 0 ? pm.scale * (1 - w) + lm.scale * w : pm.scale,
      };
    }
    out[g] = { ...p, ...(zstats?.[g] ?? {}), n: p.n + (l?.n ?? 0), metrics };
  }
  return out;
}

/** Fits metric quantiles from in-memory rows (used by refreshAll, which has
 *  every game in hand, and by the Python twin). */
export function fitLiveBaseline(rows: PlayerMetrics[]): Record<string, { n: number; metrics: Record<string, { med: number; scale: number }> }> {
  const byGroup = new Map<string, PlayerMetrics[]>();
  for (const r of rows) if (r.group) (byGroup.get(r.group) ?? byGroup.set(r.group, []).get(r.group)!).push(r);
  const out: ReturnType<typeof fitLiveBaseline> = {};
  for (const [g, rs] of byGroup) {
    const metrics: Record<string, { med: number; scale: number }> = {};
    for (const k of METRIC_KEYS) {
      const vs = rs.map((r) => r.metrics[k] ?? 0).sort((a, b) => a - b);
      const q = (f: number) => vs[Math.min(vs.length - 1, Math.floor(vs.length * f))];
      const iqr = q(0.75) - q(0.25);
      metrics[k] = { med: vs[Math.floor(vs.length / 2)], scale: iqr > 0 ? iqr / 1.349 : 0 };
    }
    out[g] = { n: rs.length, metrics };
  }
  return out;
}

// ---------------------------------------------------------------- scoring
export type GameRating = {
  score: number;
  award: "MVP" | "SVP" | "";
  group: string | null;
  /** Per-dimension z, for the detail page's radar. */
  dims: Record<string, number>;
};

const clip = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function weightsFor(r: PlayerMetrics, b: GroupBaseline): Record<string, number> {
  const [mode, role] = (r.group as string).split("|");
  const base = (mode === "sr" ? W_SR : W_MAYHEM)[role];
  // Build correction: tankier than the role's median build shifts weight
  // from 输出 to 承伤, and vice versa. Continuous, capped at ±0.08, so a
  // Galio who built full tank isn't graded on a mage's yardstick.
  const shift = clip((r.tankIdx - b.tank_idx_median) * 0.4, -0.08, 0.08);
  const w = { ...base };
  if ("承伤" in w && "输出" in w) {
    w["承伤"] += shift;
    w["输出"] -= shift;
  }
  const tot = Object.values(w).reduce((a, v) => a + v, 0);
  for (const k of Object.keys(w)) w[k] /= tot;
  return w;
}

function rawZ(r: PlayerMetrics, b: GroupBaseline): { Z: number; dims: Record<string, number> } {
  const W = weightsFor(r, b);
  const DIMS = DIMS_BY_MODE[(r.group as string).split("|")[0]];
  const dims: Record<string, number> = {};
  const usedW: Record<string, number> = {};
  for (const [dim, wd] of Object.entries(W)) {
    let acc = 0;
    let tw = 0;
    for (const [k, wk] of Object.entries(DIMS[dim])) {
      // A metric absent from the row (timeline not fetched) or from the
      // baseline is skipped and the rest of the dimension re-weighted; a
      // dimension with nothing left drops out and the role weights
      // re-normalise. Scores stay comparable, just on fewer inputs.
      const bm = b.metrics[k];
      const v = r.metrics[k];
      if (v === undefined || !bm) continue;
      acc += wk * clip((v - bm.med) / (bm.scale || 1e-9), -3, 3);
      tw += wk;
    }
    if (tw > 0) {
      dims[dim] = acc / tw;
      usedW[dim] = wd;
    }
  }
  const tot = Object.values(usedW).reduce((a, v) => a + v, 0) || 1e-9;
  let Z = 0;
  for (const d of Object.keys(dims)) Z += (usedW[d] / tot) * dims[d];
  return { Z, dims };
}

/**
 * Scores one game. Every player is measured against their own role's
 * distribution, so a 12 means the same thing for a support as for an ADC.
 *
 * Score: 10 ± 3 standard deviations of the role's Z, clamped to [0, 20]. A
 * typical game sits near 10; 15+ is a standout; the cap is only reachable
 * by maxing several dimensions at once.
 *
 * Awards: one MVP on the winning side, one SVP on the losing side, chosen
 * by RESIDUAL against the role's (outcome-conditional) distribution rather
 * than by raw score. Winners' scores are inflated by winning, and more so
 * for carries than supports, so picking the raw maximum would still skew
 * MVPs towards the bottom lane (25.6% vs 12.4% for supports). Comparing
 * each player with others of their role who also won/lost is exactly
 * 掌盟's stated intent -- "胜方真正推动比赛的人 / 败方认真发挥的人" -- and
 * brings the spread down to 23.9% / 14.2%. AFK rows are never eligible.
 */
export function scoreGame(rows: PlayerMetrics[], baseline: Baseline): Record<string, GameRating> {
  const out: Record<string, GameRating> = {};
  const scored: { r: PlayerMetrics; Z: number; resid: number }[] = [];
  for (const r of rows) {
    const b = r.group ? baseline[r.group] : undefined;
    if (!b) {
      out[r.puuid] = { score: NaN, award: "", group: r.group, dims: {} };
      continue;
    }
    const { Z, dims } = rawZ(r, b);
    const zs = (Z - b.z_mean) / (b.z_sd || 1e-9);
    const oc = b.z_by_outcome[r.win ? "win" : "loss"];
    const resid = (Z - oc.mean) / (oc.sd || 1e-9);
    out[r.puuid] = { score: Math.round(clip(10 + 3 * zs, 0, 20) * 100) / 100, award: "", group: r.group, dims };
    scored.push({ r, Z, resid });
  }
  for (const teamId of new Set(rows.map((r) => r.teamId))) {
    const cands = scored.filter((s) => s.r.teamId === teamId && s.r.position !== "AFK");
    if (!cands.length) continue;
    const best = cands.reduce((a, s) => {
      if (s.resid !== a.resid) return s.resid > a.resid ? s : a;
      const ka = a.r.metrics.d_kp, kb = s.r.metrics.d_kp;
      if (ka !== kb) return kb > ka ? s : a;
      return s.r.metrics.kda_cap > a.r.metrics.kda_cap ? s : a;
    });
    out[best.r.puuid].award = best.r.win ? "MVP" : "SVP";
  }
  return out;
}

export type ZStats = Record<string, Pick<GroupBaseline, "z_mean" | "z_sd" | "z_by_outcome" | "tank_idx_median">>;

/**
 * Standardisation stats per group from a full set of rows, scored against
 * `baseline`. These barely move as data grows (half-sample fit vs full:
 * mean score drift 0.05), so they're recomputed only on refreshAll, which
 * already holds every game in memory, and cached for routine syncs.
 */
export function computeZStats(rows: PlayerMetrics[], baseline: Baseline): ZStats {
  const acc = new Map<string, { z: number[]; win: number[]; loss: number[]; ti: number[] }>();
  for (const r of rows) {
    const b = r.group ? baseline[r.group] : undefined;
    if (!b) continue;
    const a = acc.get(r.group!) ?? { z: [], win: [], loss: [], ti: [] };
    const { Z } = rawZ(r, b);
    a.z.push(Z);
    (r.win ? a.win : a.loss).push(Z);
    a.ti.push(r.tankIdx);
    acc.set(r.group!, a);
  }
  const stat = (xs: number[]) => {
    if (!xs.length) return { mean: 0, sd: 1 };
    const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, v) => s + (v - mean) ** 2, 0) / xs.length);
    return { mean, sd };
  };
  const out: ZStats = {};
  for (const [g, a] of acc) {
    if (a.z.length < 50) continue; // too few rows to trust; keep the prior's numbers
    const all = stat(a.z);
    const ti = [...a.ti].sort((x, y) => x - y);
    out[g] = {
      z_mean: all.mean,
      z_sd: all.sd,
      z_by_outcome: { win: stat(a.win), loss: stat(a.loss) },
      tank_idx_median: ti[Math.floor(ti.length / 2)],
    };
  }
  return out;
}
