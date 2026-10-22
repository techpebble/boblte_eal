/**
 * Turning a calendar date into the span of instants it covers.
 *
 * A date issued or a date used is a calendar day as it is lived where the
 * records are kept, so both ends of a window have to be built in the same
 * timezone. They were not: the lower bound came from `new Date("2026-10-22")`,
 * which parses as UTC midnight — 05:30 on the 22nd in a +05:30 zone, half a
 * day inside the window it was meant to open — while the upper bound used
 * setHours, which is local.
 *
 * Records are written with `new Date("22-Oct-2026")`, which parses as LOCAL
 * midnight. In +05:30 that is 18:30 UTC on the 21st: one millisecond past
 * the previous day's upper bound and five and a half hours before the
 * current day's lower bound. An entry made today therefore belonged to no
 * single day at all, and only appeared in a range wide enough to straddle
 * the gap.
 *
 * Building both ends locally closes it, and takes records written either
 * way — local midnight or UTC midnight — into the day they belong to.
 */

/** The calendar date a value names, as a local Date at midnight. */
function calendarDay(value) {
  if (value instanceof Date) {
    return isNaN(value)
      ? null
      : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const text = String(value ?? '').trim();
  if (!text) return null;

  // An ISO date on its own would parse as UTC, so read the parts directly.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  const parsed = new Date(text);
  if (isNaN(parsed)) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/** Local midnight on the day [value] names, or null if it names none. */
export function startOfDay(value) {
  const day = calendarDay(value);
  if (!day) return null;
  day.setHours(0, 0, 0, 0);
  return day;
}

/** The last millisecond of the day [value] names. */
export function endOfDay(value) {
  const day = calendarDay(value);
  if (!day) return null;
  day.setHours(23, 59, 59, 999);
  return day;
}
