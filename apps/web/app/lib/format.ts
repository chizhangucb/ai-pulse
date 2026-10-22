import { siteDate, siteTime, siteWeekday, monthDay } from "@aihot/contracts/time";

/** A list cut into runs of the same day in the site's zone, in the list's own order. */
export function bySiteDay<T>(list: readonly T[], at: (entry: T) => string): Array<{ day: string; entries: T[] }> {
  const days: Array<{ day: string; entries: T[] }> = [];
  for (const entry of list) {
    const day = siteDate(at(entry));
    const last = days.at(-1);
    if (last?.day === day) last.entries.push(entry);
    else days.push({ day, entries: [entry] });
  }
  return days;
}

/** "Sat" of a calendar date (YYYY-MM-DD). */
export function weekdayShort(date: string): string {
  return siteWeekday(date).slice(0, 3);
}

export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d < 30) return d === 1 ? "1 day ago" : `${d} days ago`;
  return siteDate(iso);
}

export function fullDateTime(iso: string): string {
  return `${siteDate(iso)} ${siteTime(iso)}`;
}

/** "Sep 24 10:51" (site zone), for lists that span days. */
export function monthDayTime(iso: string): string {
  return `${monthDay(siteDate(iso))} ${siteTime(iso)}`;
}

export function sourceInitial(name: string): string {
  const s = name.replace(/^[^\p{L}\p{N}]+/u, "");
  return (s[0] ?? "A").toUpperCase();
}
