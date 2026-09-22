import "server-only";

import { sql } from "@vercel/postgres";

export { POSITIONS, POSITION_LABEL, isPosition } from "@/lib/positions";

/** Today's calendar date in Beijing time, as YYYY-MM-DD. */
export function beijingDateString(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export type Signup = {
  date: string;
  member: string;
  position: string;
  champions: string[];
  declaration: string;
  updatedAt: string;
  // Wall-clock minutes since 00:00 on `date`. A booking can cross
  // midnight -- see the effectiveEndMinute()/crossesMidnight() note in
  // lib/time.ts. Both null when the member didn't set a booking window.
  startMinute: number | null;
  endMinute: number | null;
};

type SignupRow = {
  // The driver parses DATE/TIMESTAMPTZ columns into native JS Date
  // objects, not strings, so both fields are normalized through
  // normalizeDateOnly() / normalizeTimestamp() below before they leave
  // this module -- see the identical note on LedgerRow in db.ts.
  signup_date: string | Date;
  member: string;
  position: string | null;
  champion_pick_1: string | null;
  champion_pick_2: string | null;
  champion_pick_3: string | null;
  declaration: string | null;
  updated_at: string | Date;
  start_minute: number | null;
  end_minute: number | null;
};

function normalizeDateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function normalizeTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toSignup(r: SignupRow): Signup {
  return {
    date: normalizeDateOnly(r.signup_date),
    member: r.member,
    position: r.position ?? "",
    champions: [r.champion_pick_1, r.champion_pick_2, r.champion_pick_3].filter(
      (c): c is string => Boolean(c)
    ),
    declaration: r.declaration ?? "",
    updatedAt: normalizeTimestamp(r.updated_at),
    startMinute: r.start_minute === null ? null : Number(r.start_minute),
    endMinute: r.end_minute === null ? null : Number(r.end_minute),
  };
}

export async function getSignupsForDate(date: string): Promise<Signup[]> {
  const { rows } = await sql<SignupRow>`
    SELECT signup_date, member, position, champion_pick_1, champion_pick_2, champion_pick_3,
           declaration, updated_at, start_minute, end_minute
    FROM signups
    WHERE signup_date = ${date}
    ORDER BY updated_at ASC
  `;
  return rows.map(toSignup);
}

/** Which dates in [startDate, endDate] (inclusive, YYYY-MM-DD) have at least one sign-up -- for calendar dots. */
export async function getSignupDatesInRange(startDate: string, endDate: string): Promise<Set<string>> {
  const { rows } = await sql<{ signup_date: string | Date }>`
    SELECT DISTINCT signup_date FROM signups
    WHERE signup_date BETWEEN ${startDate} AND ${endDate}
  `;
  // The driver parses DATE columns into native JS Date objects, not
  // strings, so this Set must be built from normalized "YYYY-MM-DD"
  // strings -- otherwise `.has(someDateString)` below never matches and
  // the calendar dots silently never show.
  return new Set(rows.map((r) => normalizeDateOnly(r.signup_date)));
}

export async function deleteSignup(date: string, member: string): Promise<void> {
  await sql`DELETE FROM signups WHERE signup_date = ${date} AND member = ${member}`;
}

export type SignupInput = {
  date: string;
  member: string;
  position: string;
  champions: string[]; // up to 3, blanks dropped
  declaration: string;
  startMinute: number | null; // both null = no booking window set
  endMinute: number | null;
};

export async function upsertSignup(input: SignupInput): Promise<void> {
  const [c1, c2, c3] = [input.champions[0] ?? null, input.champions[1] ?? null, input.champions[2] ?? null];
  await sql`
    INSERT INTO signups (
      signup_date, member, position, champion_pick_1, champion_pick_2, champion_pick_3,
      declaration, start_minute, end_minute, updated_at
    )
    VALUES (
      ${input.date}, ${input.member}, ${input.position}, ${c1}, ${c2}, ${c3},
      ${input.declaration}, ${input.startMinute}, ${input.endMinute}, now()
    )
    ON CONFLICT (signup_date, member) DO UPDATE SET
      position = EXCLUDED.position,
      champion_pick_1 = EXCLUDED.champion_pick_1,
      champion_pick_2 = EXCLUDED.champion_pick_2,
      champion_pick_3 = EXCLUDED.champion_pick_3,
      declaration = EXCLUDED.declaration,
      start_minute = EXCLUDED.start_minute,
      end_minute = EXCLUDED.end_minute,
      updated_at = now()
  `;
}
