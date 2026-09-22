// Small calendar-date ("YYYY-MM-DD") helpers with no server dependency, so
// both server components (schedule page, timeline) and the client signup
// form can share them. Used to spell out the actual date when a booking
// window crosses midnight, instead of a bare "次日" that doesn't say which
// calendar day it actually lands on.

/** "YYYY-MM-DD" + delta days -> "YYYY-MM-DD", safe across month/year
 * boundaries. Pure date-string math done in UTC so it's never affected by
 * the runtime's local timezone. */
export function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" -> "M月D日" for compact display. */
export function formatShortDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}月${d}日`;
}
