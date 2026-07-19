/**
 * Local YYYY-MM-DD, deliberately NOT using `Date.toISOString()` — that
 * converts to UTC first, which silently rolls the date forward for anyone
 * west of UTC in the evening... no wait, it rolls forward for anyone EAST
 * of UTC (e.g. Nepal, UTC+5:45) during the last few hours of their local
 * day. This was the exact off-by-one-day bug in the previous version's
 * booking form.
 */
export function todayLocalISODate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
