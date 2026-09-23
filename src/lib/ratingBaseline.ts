import "server-only";

import { db, sql } from "@vercel/postgres";
import {
  METRIC_KEYS,
  PRIOR_BASELINE,
  mergeBaselines,
  type Baseline,
  type ZStats,
} from "@/lib/rating";

// Builds the baseline the v3 rating compares against: the shipped prior
// (1272 ranked + 4620 Mayhem games, incl. opponents) blended with whatever
// this database has stored, weighted by sample size. Runs on every sync so
// the yardstick keeps moving with the team's own history -- no cache to
// invalidate, no job to schedule.
//
// The live half is ONE aggregate query: Postgres computes the quartiles of
// every metric per role group server-side (percentile_cont over the JSONB),
// returning ~9 rows. Pulling the tens of thousands of metric rows into the
// function to do the same in JS would blow the sync route's 60s budget.

const ZSTATS_KEY = "rating_v3_zstats";

type LiveRow = { rating_group: string; n: string | number } & Record<string, unknown>;

// pg returns float8[] either parsed or as "{a,b,c}" depending on the driver
// in play (@vercel/postgres in production, the pg shim locally).
function toTriple(v: unknown): [number, number, number] | null {
  const arr = Array.isArray(v)
    ? v.map(Number)
    : typeof v === "string"
      ? v.replace(/[{}]/g, "").split(",").map(Number)
      : null;
  if (!arr || arr.length !== 3 || arr.some((x) => !Number.isFinite(x))) return null;
  return [arr[0], arr[1], arr[2]];
}

export async function loadLiveQuantiles(): Promise<Record<string, { n: number; metrics: Record<string, { med: number; scale: number }> }>> {
  // METRIC_KEYS is a closed set of identifiers defined in code, never user
  // input, which is the only reason it's safe to splice into SQL here.
  const aggs = METRIC_KEYS.map(
    (k) => `percentile_cont(ARRAY[0.25, 0.5, 0.75]) WITHIN GROUP (ORDER BY (metrics->>'${k}')::double precision) AS "${k}"`
  ).join(",\n      ");
  const client = await db.connect();
  let rows: LiveRow[];
  try {
    const res = await client.query(
      `SELECT rating_group, count(*) AS n,
      ${aggs}
       FROM match_players
       WHERE metrics IS NOT NULL AND rating_group IS NOT NULL
       GROUP BY rating_group`
    );
    rows = res.rows as LiveRow[];
  } finally {
    client.release();
  }
  const out: ReturnType<typeof loadLiveQuantiles> extends Promise<infer T> ? T : never = {};
  for (const r of rows) {
    const metrics: Record<string, { med: number; scale: number }> = {};
    for (const k of METRIC_KEYS) {
      const q = toTriple(r[k]);
      if (!q) continue;
      const [q1, med, q3] = q;
      metrics[k] = { med, scale: q3 - q1 > 0 ? (q3 - q1) / 1.349 : 0 };
    }
    out[r.rating_group] = { n: Number(r.n), metrics };
  }
  return out;
}

export async function loadZStats(): Promise<ZStats | undefined> {
  try {
    const { rows } = await sql<{ value: string }>`SELECT value FROM app_settings WHERE key = ${ZSTATS_KEY}`;
    return rows[0] ? (JSON.parse(rows[0].value) as ZStats) : undefined;
  } catch {
    return undefined;
  }
}

export async function saveZStats(z: ZStats): Promise<void> {
  const value = JSON.stringify(z);
  await sql`
    INSERT INTO app_settings (key, value) VALUES (${ZSTATS_KEY}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}

/** Prior ⊕ live quantiles ⊕ cached standardisation stats. Any part failing
 *  degrades to the prior rather than failing the sync. */
export async function loadBaseline(): Promise<Baseline> {
  let live: Awaited<ReturnType<typeof loadLiveQuantiles>> = {};
  try {
    live = await loadLiveQuantiles();
  } catch (err) {
    // First run before db/schema_rating_v3.sql, or an empty table: prior only.
    console.warn("[rating] live baseline unavailable, using prior only:", err instanceof Error ? err.message : err);
  }
  return mergeBaselines(PRIOR_BASELINE, live, await loadZStats());
}
