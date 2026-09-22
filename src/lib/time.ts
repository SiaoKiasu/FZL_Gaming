// Small time-of-day helpers shared between the schedule signup form
// (client), its API route (server) and the timeline display (server).
// Deliberately has no "server-only" import so client components can use it.
//
// Both startMinute and endMinute are wall-clock minutes since 00:00 on the
// signup's date (5-minute granularity, 0-1435). A booking can cross
// midnight: when endMinute <= startMinute, the session is understood to
// run past 00:00 into the next calendar day. Use effectiveEndMinute() /
// crossesMidnight() below instead of comparing the raw fields directly
// whenever you need continuous range math (duration, overlap, timeline
// position) rather than the literal clock time.

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

/** Extend endMinute past MINUTES_PER_DAY when a booking crosses midnight,
 * so callers can do continuous range/overlap math (e.g. 23:00 -> 01:00
 * becomes 1380 -> 1500) instead of the raw wall-clock value wrapping back
 * to something smaller than startMinute. */
export function effectiveEndMinute(startMinute: number, endMinute: number): number {
  return endMinute <= startMinute ? endMinute + MINUTES_PER_DAY : endMinute;
}

/** True when a booking's end time falls on the day after its signup date. */
export function crossesMidnight(startMinute: number, endMinute: number): boolean {
  return endMinute <= startMinute;
}
