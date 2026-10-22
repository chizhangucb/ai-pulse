// Calendar helpers in the site's time zone (SITE.timeZone, an IANA zone with daylight saving), shared by web
// and backend.

import { SITE } from "@aihot/site";

/** The zone's name, for whatever takes one (a scheduler, a report's metadata, SQL `AT TIME ZONE`). */
export const SITE_TIMEZONE = SITE.timeZone;

const WALL = new Intl.DateTimeFormat("en-US", {
  timeZone: SITE_TIMEZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** The instant's wall clock in the site's zone, read as if it were UTC (so its ISO string is the local time). */
function wallClock(instant: Date | string | number): Date {
  const t = new Date(instant).getTime();
  const p = Object.fromEntries(WALL.formatToParts(t).map((x) => [x.type, x.value]));
  // Intl drops the era, so a year outside 1–9999 would read as some other date: none is displayable.
  if (!(Number(p.year) >= 1 && Number(p.year) <= 9999)) throw new RangeError(`date out of range: ${t}`);
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second), t % 1000 < 0 ? t % 1000 + 1000 : t % 1000));
}

/** Minutes the site's zone is ahead of UTC at the instant (negative west of Greenwich). */
function offsetMinutes(instant: Date | string | number): number {
  return Math.round((wallClock(instant).getTime() - new Date(instant).getTime()) / 60000);
}

/** "-07:00" / "+05:30" for an offset in minutes. */
function offsetLabel(minutes: number): string {
  const a = Math.abs(minutes);
  return `${minutes < 0 ? "-" : "+"}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

/** YYYY-MM-DD of the instant in the site's zone. */
export function siteDate(instant: Date | string | number): string {
  return wallClock(instant).toISOString().slice(0, 10);
}

/** HH:mm of the instant in the site's zone. */
export function siteTime(instant: Date | string | number): string {
  return wallClock(instant).toISOString().slice(11, 16);
}

/** The instant as ISO 8601 in the site's zone, to the millisecond: "2026-09-26T08:07:13.000-07:00". */
export function siteIso(instant: Date | string | number): string {
  return `${wallClock(instant).toISOString().slice(0, 23)}${offsetLabel(offsetMinutes(instant))}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "Sep 28" of a calendar date (YYYY-MM-DD). Given `today` (YYYY-MM-DD, site zone), a day of another year carries
 * its year, so an archived item is not read as this year's: "Feb 19, 2019".
 */
export function monthDay(date: string, today?: string): string {
  const year = today && date.slice(0, 4) !== today.slice(0, 4) ? `, ${date.slice(0, 4)}` : "";
  return `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}${year}`;
}

/** "Sep 29" in the site's zone. */
export const siteDay = (instant: Date | string | number) => monthDay(siteDate(instant));

/** "Sep 29 13:40" in the site's zone. */
export const siteStamp = (instant: Date | string | number) => `${siteDay(instant)} ${siteTime(instant)}`;

/** UTC instant of an HH:mm wall-clock time in the site's zone on the given calendar day. */
export function siteAt(date: string, time: string): Date {
  const wall = Date.parse(`${date}T${time}:00Z`);
  if (Number.isNaN(wall)) return new Date(NaN);
  // The offset at the wall time read as UTC is off by at most one transition; one more pass settles it.
  const first = wall - offsetMinutes(wall) * 60000;
  return new Date(wall - offsetMinutes(first) * 60000);
}

/** UTC instant of 00:00 in the site's zone on the given calendar day. */
export function siteMidnight(date: string): Date {
  return siteAt(date, "00:00");
}

export function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function siteWeekday(date: string): string {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
}

/** ISO week label (e.g. 2026-W38) of a calendar date. */
export function isoWeekLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day + 3); // Thursday of this week
  const year = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Monday..Sunday calendar dates of an ISO week label. */
export function isoWeekRange(label: string): { start: string; end: string } | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(label);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const start = new Date(mondayWeek1);
  start.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7);
  const startDate = start.toISOString().slice(0, 10);
  if (isoWeekLabel(startDate) !== label) return null;
  return { start: startDate, end: addDays(startDate, 6) };
}

/** First and last day (YYYY-MM-DD) of a calendar month label such as 2026-09; null for anything else. */
export function monthRange(label: string): { start: string; end: string } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(label);
  if (!m) return null;
  const next = Number(m[2]) === 12 ? `${Number(m[1]) + 1}-01-01` : `${m[1]}-${String(Number(m[2]) + 1).padStart(2, "0")}-01`;
  return { start: `${label}-01`, end: addDays(next, -1) };
}

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === date;
}
