// The Monday source-health report for the ops chat. It goes through the same gated channel as the
// alerts (off unless FEISHU_INTERNAL_ENABLED).
import { sql } from "../db.ts";
import { sendAlert } from "../notify/feishu.ts";
import { serverModules } from "../modules.ts";
import { rhythmText, SOURCE_PROBLEMS, sourceHealth, sourceHealthList } from "../sources/health.ts";
import { dismissedFollowUps } from "./alerts.ts";

/** The change from b to a: "+12%", "—" without a b. Also the modules' reports. */
export const pct = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${(((a - b) / b) * 100).toFixed(0)}%` : "—");
/** A count with thousands separators. */
export const n = (v: number) => v.toLocaleString("en-US");

/** Monday 09:00: how the sources did over the last seven days, quiet ones included (the daily follow-ups leave them out). */
export async function sourceHealthWeekly(now = Date.now()) {
  const since = new Date(now - 7 * 86400_000);
  const before = new Date(now - 14 * 86400_000);
  const [[counts], [items], groups, dismissed] = await Promise.all([
    sql<{ enabled: number; failing: number; degraded: number; added: number }[]>`
      SELECT count(*) FILTER (WHERE enabled)::int AS enabled,
             count(*) FILTER (WHERE enabled AND health = 'failing')::int AS failing,
             count(*) FILTER (WHERE enabled AND health = 'degraded')::int AS degraded,
             count(*) FILTER (WHERE created_at >= ${since})::int AS added
      FROM sources`,
    sql<{ week: number; prev: number; selected: number }[]>`
      SELECT count(*) FILTER (WHERE discovered_at >= ${since})::int AS week,
             count(*) FILTER (WHERE discovered_at >= ${before} AND discovered_at < ${since})::int AS prev,
             (SELECT count(*)::int FROM publications p WHERE p.selected AND p.visibility <> 'withdrawn' AND p.discovered_at >= ${since}) AS selected
      FROM articles WHERE discovered_at >= ${before}`,
    sourceHealth(now),
    dismissedFollowUps(),
  ]);
  const lines = [
    `${n(items!.week)} items this week (last week ${n(items!.prev)}, ${pct(items!.week, items!.prev)}), ${n(items!.selected)} of them selected`,
    `${counts!.enabled} sources in use, ${counts!.added} added this week; ${counts!.failing} failing, ${counts!.degraded} unstable`,
  ];
  // The modules' own collectors, a line each.
  for (const m of serverModules()) if (m.sourceHealth) lines.push(...(await m.sourceHealth(now)));
  for (const group of groups) {
    lines.push("", `${group.name}: ${group.sources.length} sources in use; ${n(group.sources.reduce((sum, s) => sum + s.items, 0))} items this week; ${group.failing.length} failing in a row, ${group.unstable.length} failing intermittently, ${group.overdue.length} past their own rhythm, ${group.unknown.length} with nothing new for 7 days`);
    for (const p of SOURCE_PROBLEMS) {
      if (!group[p.problem].length) continue;
      lines.push(`${p.title}: ${sourceHealthList(group[p.problem], s => {
        const dismissal = dismissed[`sources.${p.problem}.${s.id}`];
        return p.describe(s) + (dismissal ? ` (marked won't fix: ${dismissal.reason})` : "");
      })}`);
    }
    if (group.overdue.length) lines.push(`Past their own rhythm (compare with the original site first, to tell a broken collection from a source that slowed down): ${sourceHealthList(group.overdue, rhythmText)}`);
    if (group.unknown.length) lines.push(`Nothing new for 7 days (not enough output in the window to judge a rhythm, or never received anything): ${sourceHealthList(group.unknown, rhythmText)}`);
  }
  const failing = counts!.failing;
  const overdue = groups.reduce((sum, g) => sum + g.overdue.length, 0);
  // Quiet sources still worth a look: past their own rhythm, or not judgeable.
  const silent = overdue + groups.reduce((sum, g) => sum + g.unknown.length, 0);
  const followUp = counts!.failing > 0 || silent > 0 || groups.some(g => g.failing.length || g.unstable.length || g.quality.length || g.details.length);
  lines.push("", followUp ? "To act on this, hand this message to the AI; details are on the admin Sources and Runs pages." : "No sources need attention.");
  await sendAlert("📊 Weekly source report", lines);
  return { failing, silent, overdue };
}
