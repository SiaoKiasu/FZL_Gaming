// Small time-of-day helpers shared between the schedule signup form
// (client), its API route (server) and the timeline display (server).
// Deliberately has no "server-only" import so client components can use it.
//
// Bookings are same-day only, 5-minute granularity, minutes since 00:00.
// Max representable end time is 23:55 (1435) -- there's no overnight
// wraparound yet (a session that runs past midnight just gets logged as
// ending at 23:55).

export const TIME_STEP_MINUTES = 5;
export const MINUTES_PER_DAY = 24 * 60;
export const MAX_MINUTE = MINUTES_PER_DAY - TIME_STEP_MINUTES; // 1435 (23:55)

export function isValidMinute(m: number): boolean {
  return Number.isInteger(m) && m >= 0 && m <= MAX_MINUTE && m % TIME_STEP_MINUTES === 0;
}

/** "HH:MM" -> minutes since 00:00, or null if not a valid HH:MM string. */
export function parseTimeString(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** minutes since 00:00 -> "HH:MM", for <input type="time"> values and display. */
export function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Round to the nearest 5-minute step, clamped to [0, MAX_MINUTE]. */
export function roundToStep(m: number): number {
  const rounded = Math.round(m / TIME_STEP_MINUTES) * TIME_STEP_MINUTES;
  return Math.min(Math.max(rounded, 0), MAX_MINUTE);
}
