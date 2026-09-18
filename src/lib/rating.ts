// Ported from lol_ranked_sync/rating.py (v2, 2026-09-03) — keep the two in
// sync if the weighting ever changes. See that file's docstring for the
// design rationale (WeGame / Riot honor / Gamercraft / academic sources).

type Participant = Record<string, unknown>;

const COMMON: Record<string, number> = {
  dmg_share: 0.22,
  kp: 0.15,
  gold_pm: 0.08,
  kda: 0.08,
  deaths_neg: 0.07,
  tank: 0.05,
};

const ROLE: Record<string, Record<string, number>> = {
  TOP: { tank: 0.12, objective_dmg: 0.08, solo_kills: 0.08, cs_pm: 0.07 },
  JUNGLE: { objective_dmg: 0.15, kp: 0.08, tank: 0.07, vision_pm: 0.05 },
  MIDDLE: { dmg_share: 0.12, cs_pm: 0.08, solo_kills: 0.08, dmg_pm: 0.07 },
  BOTTOM: { dmg_share: 0.15, cs_pm: 0.08, gold_pm: 0.07, dmg_pm: 0.05 },
  UTILITY: { vision_pm: 0.15, heal_shield: 0.08, cc_time: 0.07, kp: 0.05 },
};
const ROLE_DEFAULT: Record<string, number> = {
  dmg_share: 0.1,
  tank: 0.1,
  vision_pm: 0.05,
  objective_dmg: 0.05,
  cs_pm: 0.05,
};

const KP_PENALTY_RANKS = 4;
const KP_PENALTY = 0.9;

function num(x: unknown): number {
  const n = typeof x === "number" ? x : parseFloat(String(x ?? 0));
  return Number.isFinite(n) ? n : 0;
}

type RawMetrics = Record<string, number> & {
  _taken_share: number;
  _mitigated: number;
};

function rawMetrics(p: Participant): RawMetrics {
  const ch = (p.challenges as Record<string, unknown>) || {};
  const kills = num(p.kills);
  const deaths = num(p.deaths);
  const assists = num(p.assists);
  const minutes = Math.max(num(p.timePlayed) / 60, 1);
  const cs = num(p.totalMinionsKilled) + num(p.neutralMinionsKilled);
  return {
    dmg_share: num(ch.teamDamagePercentage),
    kp: num(ch.killParticipation),
    gold_pm: num(ch.goldPerMinute) || num(p.goldEarned) / minutes,
    kda: Math.min(num(ch.kda) || (kills + assists) / Math.max(deaths, 1), 10),
    deaths_neg: -deaths,
    _taken_share: num(ch.damageTakenOnTeamPercentage),
    _mitigated: num(p.damageSelfMitigated),
    objective_dmg: num(p.damageDealtToObjectives),
    solo_kills: num(ch.soloKills),
    cs_pm: cs / minutes,
    dmg_pm: num(ch.damagePerMinute) || num(p.totalDamageDealtToChampions) / minutes,
    vision_pm: num(ch.visionScorePerMinute) || num(p.visionScore) / minutes,
    heal_shield: num(p.totalHealsOnTeammates) + num(p.totalDamageShieldedOnTeammates),
    cc_time: num(p.timeCCingOthers),
  };
}

function normalize(mets: Record<string, RawMetrics>): Record<string, Record<string, number>> {
  const ids = Object.keys(mets);
  const keys = Object.keys(mets[ids[0]]).filter((k) => k !== "tank");
  const lo: Record<string, number> = {};
  const hi: Record<string, number> = {};
  for (const k of keys) {
    lo[k] = Math.min(...ids.map((id) => mets[id][k]));
    hi[k] = Math.max(...ids.map((id) => mets[id][k]));
  }
  const out: Record<string, Record<string, number>> = {};
  for (const id of ids) {
    const m = mets[id];
    const n: Record<string, number> = {};
    for (const k of keys) {
      n[k] = hi[k] === lo[k] ? 0.5 : (m[k] - lo[k]) / (hi[k] - lo[k]);
    }
    n.tank = (n._taken_share + n._mitigated) / 2;
    delete n._taken_share;
    delete n._mitigated;
    out[id] = n;
  }
  return out;
}

export type GameRating = { score: number; award: "MVP" | "SVP" | "" };

export function scoreGame(participants: Participant[]): Record<string, GameRating> {
  if (!participants.length) return {};
  const mets: Record<string, RawMetrics> = {};
  for (const p of participants) mets[String(p.puuid)] = rawMetrics(p);
  const norm = normalize(mets);
  const kpSorted = Object.keys(mets).sort((a, b) => mets[a].kp - mets[b].kp);
  const lowKp = new Set(kpSorted.slice(0, KP_PENALTY_RANKS));

  const out: Record<string, GameRating & { _tie: [number, number]; _afk: boolean }> = {};
  for (const p of participants) {
    const pid = String(p.puuid);
    const weights: Record<string, number> = { ...COMMON };
    const roleWeights = ROLE[String(p.teamPosition ?? "")] ?? ROLE_DEFAULT;
    for (const [k, w] of Object.entries(roleWeights)) {
      weights[k] = (weights[k] ?? 0) + w;
    }
    let sum = 0;
    let weightSum = 0;
    for (const [k, w] of Object.entries(weights)) {
      sum += w * (norm[pid][k] ?? 0);
      weightSum += w;
    }
    let s = sum / weightSum;
    if (lowKp.has(pid)) s *= KP_PENALTY;
    out[pid] = {
      score: Math.round(s * 10 * 100) / 100,
      award: "",
      _tie: [mets[pid].kp, mets[pid].kda],
      _afk: Boolean(p.wasAfk),
    };
  }

  for (const teamWin of [true, false]) {
    const cands = participants.filter(
      (p) => Boolean(p.win) === teamWin && !out[String(p.puuid)]._afk
    );
    if (cands.length) {
      const best = cands.reduce((a, b) => {
        const oa = out[String(a.puuid)];
        const ob = out[String(b.puuid)];
        if (oa.score !== ob.score) return oa.score > ob.score ? a : b;
        return oa._tie[0] !== ob._tie[0]
          ? oa._tie[0] > ob._tie[0]
            ? a
            : b
          : oa._tie[1] > ob._tie[1]
            ? a
            : b;
      });
      out[String(best.puuid)].award = teamWin ? "MVP" : "SVP";
    }
  }

  const result: Record<string, GameRating> = {};
  for (const [pid, v] of Object.entries(out)) {
    result[pid] = { score: v.score, award: v.award };
  }
  return result;
}
