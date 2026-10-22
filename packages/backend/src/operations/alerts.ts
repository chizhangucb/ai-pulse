// Operations alerts. The person reading them is the site owner, not an engineer: each
// message says what readers see, whether it heals by itself and what, if anything, the owner must do.
//   now   — readers are affected and it has not healed: sent at once, repeated hourly, recovery reported.
//   today — money at risk or only the owner can act: sent at once, repeated at most daily, recovery reported.
//   later — other follow-ups: one 09:00 message a day, meant to be handed to the AI. A source's follow-up is
//           closed on its own: a fix removes it, and one judged not worth fixing is closed with a reason.
// Delivery goes through sendAlert (ops chat, internal-chat fallback; off unless FEISHU_INTERNAL_ENABLED).
import { addDays, siteAt, siteDate, siteDay, siteStamp, isValidDate } from "@aihot/contracts/time";
import { ALERTS, EDITION_TIMES } from "@aihot/site";
import { audit } from "../audit.ts";
import { sql } from "../db.ts";
import { agentHandoffs, closeAgentWake, wakeAgent } from "../notify/agent.ts";
import { duration, formatAlert, formatRecovery, sendAlert, type Finding, type Level } from "../notify/feishu.ts";
import { stepsOnService } from "../editorial/models.ts";
import { backupConfigured } from "./backup.ts";
import { GROUPING_WARN_AFTER_MS, waitingSelectedNews } from "./grouping.ts";
import { upstreamFindings } from "../media/upstream.ts";
import { serverModules } from "../modules.ts";
import { awaitingRelease, providerAccessRefused } from "../providers/receipts.ts";
import { SOURCE_PROBLEMS, sourceHealth } from "../sources/health.ts";

const REPEAT_MS: Record<Exclude<Level, "later">, number> = { now: 3600_000, today: 24 * 3600_000 };

// Valves default off: read at call time, only an explicit "true" turns them on.
const collecting = () => process.env.COLLECT_ENABLED === "true";
const modelsOn = () => process.env.MODEL_CALLS_ENABLED === "true";
/**
 * How long the site may go without a new article before it counts as stalled (ALERT_QUIET_MINUTES, else
 * the site's own setting; small source lists are quieter). At most a day: the check looks one day back.
 */
const QUIET_MINUTES = Math.min(Number(process.env.ALERT_QUIET_MINUTES || ALERTS.quietMinutes), 1440);

/** One check: the problems it finds now. `open` retains ongoing incidents, read once per round. */
type Check = (now: number, open: AlertState) => Promise<Finding[]>;

/** Everything checked every round, in the order the findings are listed. */
const CHECKS: Check[] = [
  // Readers affected now
  contentCollection,
  selectedGrouping,
  contentProcessing,
  dailyReportFindings,
  // Money, and things only the owner can do
  providerFindings,
  refusedDeliveries,
  backupAge,
  upstreamFindings,
  moduleAlerts,
  // Follow-ups
  sourceFollowUps,
  unknownOutcomes,
  agentHandoffs,
  waitingQueues,
  moduleFollowUps,
];

/** Everything wrong right now, with its level. */
export async function collectFindings(now = Date.now(), open?: AlertState): Promise<Finding[]> {
  const announced = open ?? await alertState();
  const out: Finding[] = [];
  for (const check of CHECKS) out.push(...(await check(now, announced)));
  return out;
}

// Content flow, judged by outcome: whatever broke (worker, egress proxy, models, queues), readers see
// a site that stops changing. Its persisted backlog survives worker restarts and paused valves.
async function contentCollection(now: number, open: AlertState): Promise<Finding[]> {
  if (!collecting() && !open["content.collect"]) return [];
  const [last] = await sql<{ at: Date | null }[]>`SELECT max(a.discovered_at) AS at FROM articles a
    JOIN sources s ON s.id = a.source_id WHERE s.participation_mode = 'editorial' AND a.discovered_at > now() - interval '1 day'`;
  if (last?.at && now - last.at.getTime() <= QUIET_MINUTES * 60_000) return [];
  // A site without an enabled source has nothing to collect.
  const [anySource] = await sql`SELECT 1 FROM sources WHERE enabled AND participation_mode = 'editorial' LIMIT 1`;
  if (!anySource) return [];
  return [{
    key: "content.collect",
    level: "now",
    title: "The site stopped taking in new articles",
    impact: last?.at ? `Readers see no new articles: the last one came in at ${siteStamp(last.at)}` : "Readers see no new articles: none came in within a day",
    heals: ALERTS.usualFlow ? `No, ${ALERTS.usualFlow}` : "No",
    action: "Start a maintenance run soon",
    detail: `editorial articles.discovered_at has had no new value for over ${QUIET_MINUTES} minutes (popularity signals are judged separately); check sources.schedule, the outbound proxy and collection failures`,
    since: last?.at ?? undefined,
  }];
}

/** Processing is checked while collection and models run, and while either of its incidents is open. */
const watchingProcessing = (open: AlertState) => (collecting() && modelsOn()) || !!open["content.grouping"] || !!open["content.process"];

async function selectedGrouping(now: number, open: AlertState): Promise<Finding[]> {
  if (!watchingProcessing(open)) return [];
  const waiting = (await waitingSelectedNews()).filter((item) => open["content.grouping"] || now - item.since.getTime() >= GROUPING_WARN_AFTER_MS);
  if (!waiting.length) return [];
  const manual = waiting.filter((item) => item.recovery === "manual").length;
  const receipt = waiting.some((item) => item.recovery === "receipt");
  return [{
    key: "content.grouping",
    level: "now",
    title: "Selected news is stuck in duplicate checking and not yet published",
    impact: `${waiting.length} items that qualify for the selection have not finished duplicate checking and are not selected yet; readers may see these updates late`,
    heals: manual ? `${manual} need manual handling before they recover${manual < waiting.length ? "; the rest are still recovering automatically" : ""}`
      : receipt ? "Still waiting to recover automatically; a paid request with an unknown result is released automatically once after 30 minutes" : "It will retry automatically, but the wait is already longer than normal",
    action: manual ? "Hand to the AI; check the billing, or, under an existing recovery authorization, record the billing as unknown and release it" : "Hand to the AI to check why it waits, so the backlog does not grow",
    detail: waiting.slice(0, 8).map((item) => `${item.articleId}${item.receiptId ? ` receipt #${item.receiptId}` : ""}${item.error ? `: ${item.error.slice(0, 120)}` : ""}`).join("; "),
    since: waiting[0]!.since,
  }];
}

async function contentProcessing(now: number, open: AlertState): Promise<Finding[]> {
  if (!watchingProcessing(open)) return [];
  // An article still new two hours after discovery is overdue, and one failed in the last three hours counts.
  // While an announced incident is open, the windows stay where its first detection put them: time passing
  // cannot remove unfinished articles from it. The alert's duration starts at detection, not article age.
  const incident = open["content.process"];
  const detectedAt = incident ? Math.min(now, Date.parse(incident.since)) : now;
  const overdueBefore = now - 2 * 3600_000;
  const waitingAfter = new Date(detectedAt - 2 * 86400_000);
  const waitingBefore = new Date(incident ? Math.max(overdueBefore, detectedAt) : overdueBefore);
  const failedAfter = new Date(detectedAt - 3 * 3600_000);
  const unfinished = sql`(processing_state = 'new' AND discovered_at > ${waitingAfter} AND discovered_at < ${waitingBefore})
    OR (processing_state = 'failed' AND discovered_at > ${failedAfter})`;
  const [p] = await sql<{ waiting: number; failed: number; oldest: Date | null }[]>`
    SELECT count(*) FILTER (WHERE processing_state = 'new')::int AS waiting,
           count(*) FILTER (WHERE processing_state = 'failed')::int AS failed,
           min(discovered_at) FILTER (WHERE processing_state = 'new') AS oldest
    FROM articles WHERE ${unfinished}`;
  if (p!.waiting < 10 && p!.failed < 20 && !(incident && p!.waiting + p!.failed > 0)) return [];
  const errors = await sql<{ error: string; n: number }[]>`
    SELECT left(coalesce(processing_error, '(none)'), 120) AS error, count(*)::int AS n FROM articles
    WHERE (${unfinished}) AND processing_error IS NOT NULL
    GROUP BY 1 ORDER BY 2 DESC LIMIT 3`;
  return [{
    key: "content.process",
    level: "now",
    title: "New content is stuck and cannot reach the site",
    impact: [p!.waiting > 0 && `${p!.waiting} backlogged articles still waiting to be processed`, p!.failed > 0 && `${p!.failed} articles that failed processing not yet recovered`]
      .filter(Boolean)
      .join("; ") + "; the selection and trending will miss content",
    heals: p!.failed > 0 ? "Failed articles need their processing recovered; the service coming back does not mean the backlog is cleared" : "Queued articles will keep being processed; still check that they finish",
    action: "Hand to the AI",
    // Article age is useful detail; incident duration starts at first detection.
    detail: [p!.oldest && `oldest came in at ${siteStamp(p!.oldest)}`, errors.map((e) => `${e.error} (${e.n})`).join("; ") || "no errors recorded"].filter(Boolean).join("; "),
  }];
}

// Content-group pushes the Feishu webhook refused (a removed bot, a changed address); nothing resends them.
async function refusedDeliveries(now: number, open: AlertState): Promise<Finding[]> {
  const incident = open["deliveries.failed"];
  const since = new Date((incident ? Date.parse(incident.since) : now) - 86400_000);
  const [refused] = await sql<{ n: number; target: string | null; response: string | null }[]>`
    SELECT count(*)::int AS n, max(t.note) AS target, left(max(d.response), 200) AS response FROM deliveries d JOIN notify_targets t ON t.key = d.target_key
    WHERE d.updated_at > ${since}
      AND (d.status = 'failed' OR (${!!incident} AND (d.status = 'unknown' OR (d.status IN ('pending','sending') AND d.attempts > 0))))
      AND NOT EXISTS (SELECT 1 FROM audit_log a WHERE a.action = 'delivery.drop'
        AND a.subject = 'delivery:' || d.id AND a.created_at >= d.updated_at)`;
  if (!refused!.n) return [];
  return [{
    key: "deliveries.failed",
    level: "today",
    title: "Pushes to the Feishu content group did not go out",
    impact: `${refused!.n} notifications not yet confirmed delivered to ${refused!.target ?? "the content group"}`,
    heals: "They will not be resent automatically",
    action: "Hand to the AI; if the push bot was removed from the group, you need to add it back",
    detail: refused!.response ?? "",
  }];
}

async function backupAge(now: number): Promise<Finding[]> {
  if (!backupConfigured()) return [];
  const [b] = await sql<{ value: { at: string; uploaded: boolean; filesError?: string } }[]>`SELECT value FROM settings WHERE key = 'backup.last'`;
  // A failed archive updates backup.last too. Reuse the run history so repeated failures cannot
  // reset the age; before the first success, count from the first attempt rather than from now.
  const [runs] = await sql<{ last_ok: Date | null; first_attempt: Date | null }[]>`
    SELECT max(finished_at) FILTER (WHERE status = 'ok') AS last_ok, min(started_at) AS first_attempt
    FROM job_runs WHERE job = 'ops.backup'`;
  const lastOk = Math.max(runs?.last_ok?.getTime() ?? 0, b?.value.uploaded ? Date.parse(b.value.at) : 0);
  const since = lastOk || runs?.first_attempt?.getTime() || now;
  const age = now - since;
  const state = b?.value.filesError ? `database uploaded, packing attachments failed: ${b.value.filesError}` : b?.value.uploaded === false ? "not uploaded" : "";
  if (age > 50 * 3600_000) {
    return [{
      key: "backup.failed",
      level: "today",
      title: "The database backup has failed for two days",
      impact: lastOk ? `If the server fails, the last ${duration(age)} of data may not be fully recoverable` : "There is no successful full backup yet; if the server fails, data may not be recoverable",
      heals: "No",
      action: "Hand to the AI",
      detail: `${lastOk ? "last success" : "first backup attempt"} ${siteStamp(since)}${state ? `; ${state}` : ""}; see the ops.backup run log`,
      since: new Date(since),
    }];
  }
  if (!b || !b.value.uploaded || age > 30 * 3600_000) {
    return [{ key: "backup.stale", level: "later", title: "The database backup has not succeeded for over a day", detail: b ? `last run ${siteStamp(b.value.at)}${state ? ` (${state})` : ""}; see ops.backup` : "no successful backup recorded yet" }];
  }
  return [];
}

/** What the site's modules find. */
async function moduleAlerts(now: number): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const m of serverModules()) if (m.alerts) out.push(...(await m.alerts(now)));
  return out;
}

/**
 * One follow-up per source and problem, so fixing a source removes its own line. A quiet source is left to
 * the weekly report: being slow, or too new to have a rhythm, is nothing anyone can fix, and may never end.
 */
async function sourceFollowUps(now: number): Promise<Finding[]> {
  if (!collecting()) return [];
  return (await sourceHealth(now)).flatMap(group => SOURCE_PROBLEMS.flatMap(p => group[p.problem].map((s): Finding => ({
    key: `sources.${p.problem}.${s.id}`, level: "later", title: `${group.name} source "${s.name}": ${p.title}`,
    detail: `${s.id}: ${p.describe(s)}; ${p.action}`, observedAt: p.observedAt(s) ?? undefined,
  }))));
}

/** Paid requests and content-group pushes whose outcome is not known yet. */
async function unknownOutcomes(): Promise<Finding[]> {
  const out: Finding[] = [];

  const [r] = await sql<{ receipts: number; services: string | null; deliveries: number }[]>`
    SELECT (SELECT count(*)::int FROM receipts WHERE ${awaitingRelease()}) AS receipts,
           (SELECT string_agg(DISTINCT service || '/' || purpose, ', ') FROM receipts WHERE ${awaitingRelease()}) AS services,
           (SELECT count(*)::int FROM deliveries WHERE status = 'unknown') AS deliveries`;
  if (r!.receipts > 0) {
    out.push({ key: "receipts.unknown", level: "later", title: `${r!.receipts} paid requests have unconfirmed results`, detail: `${r!.services}; see the actual impact on the admin Runs page; requests still blocking content need a check or a recovery under an existing authorization` });
  }
  if (r!.deliveries > 0) out.push({ key: "deliveries.unknown", level: "later", title: `${r!.deliveries} Feishu content group pushes may not have been delivered`, detail: "On the admin Runs page, check whether they reached the group, then mark or resend them" });
  return out;
}

/** Runnable jobs (deferred ones excluded) that have waited more than two hours. */
async function waitingQueues(now: number): Promise<Finding[]> {
  const queues = await sql<{ name: string; n: number; oldest: Date }[]>`
    SELECT name, count(*)::int AS n, min(start_after) AS oldest FROM pgboss.job
    WHERE state IN ('created', 'retry') AND start_after <= now() AND name NOT LIKE 'cron.%' GROUP BY 1`;
  return queues.filter((q) => now - q.oldest.getTime() > 2 * 3600_000).map((q): Finding => (
    { key: `queue.${q.name}`, level: "later", title: `Background jobs queued for over 2 hours: ${q.name}`, detail: `${q.n} waiting, the oldest for ${duration(now - q.oldest.getTime())}` }));
}

/** The site's modules' follow-ups. */
async function moduleFollowUps(now: number): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const m of serverModules()) if (m.followUps) out.push(...(await m.followUps(now)));
  return out;
}

/** Current routing describes possible impact; recent failed calls do not prove every step has stopped. */
async function modelStops(service: string, models?: ReadonlySet<string>): Promise<string> {
  const steps = await stepsOnService(service, models);
  return steps.length ? `${steps.join(", ")} may be affected` : "No processing step uses this model service now";
}
/** `stops` is for the services that are not models; a model service's follows from the steps that use it. */
const PROVIDERS: Record<string, { name: string; where: string; stops?: string }> = {
  llm: { name: "Default model service", where: "the model provider's console" },
  zhipu: { name: "Zhipu", where: "the Zhipu open platform" },
  dashscope: { name: "Alibaba Cloud Model Studio", where: "the Alibaba Cloud Model Studio console" },
  deepseek: { name: "DeepSeek", where: "the DeepSeek platform" },
  mimo: { name: "Xiaomi MiMo", where: "the Xiaomi MiMo open platform" },
  openrouter: { name: "OpenRouter", where: "the OpenRouter dashboard (openrouter.ai/settings)" },
  socialdata: { name: "SocialData", stops: "New posts on X are not collected", where: "the SocialData dashboard" },
  jina: { name: "Jina", stops: "Some articles cannot get their full text", where: "the Jina dashboard" },
  dajiala: { name: "Dajiala", stops: "New WeChat official account articles are not collected", where: "the Dajiala dashboard" },
};
export const providerName = (service: string) => PROVIDERS[service]?.name ?? service;
export const providerStops = async (service: string, models?: ReadonlySet<string>): Promise<string> => {
  const p = PROVIDERS[service];
  return p ? (p.stops ?? modelStops(service, models)) : "The related features stopped";
};
export const providerConsole = (service: string) => PROVIDERS[service]?.where ?? `the ${service} dashboard`;

const REFUSED_PREFIX = "provider.refused.";

/** Paid services that refuse us (no balance, a dead key), and daily budgets used up. */
async function providerFindings(now: number, open: AlertState): Promise<Finding[]> {
  const out: Finding[] = [];
  const ongoing = Object.keys(open).filter(key => key.startsWith(REFUSED_PREFIX)).map(key => key.slice(REFUSED_PREFIX.length).split(":")[0]!);
  const failures = await sql<{ service: string; model: string | null; error: string; n: number; latest: Date }[]>`
    SELECT service, model, error, count(*)::int AS n, max(started_at) AS latest FROM receipt_attempts a
    WHERE status = 'failed' AND (started_at > ${new Date(now - 3600_000)} OR service = ANY(${ongoing})) AND error IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM receipt_attempts good WHERE good.service = a.service AND good.model IS NOT DISTINCT FROM a.model AND good.status = 'received' AND good.started_at > a.started_at)
    GROUP BY service, model, error ORDER BY latest DESC`;
  const models = new Map<string, { service: string; model: string | null; n: number; last: string; latest: number }>();
  for (const p of failures) {
    if (!providerAccessRefused(p.service, p.error)) continue;
    const key = `${REFUSED_PREFIX}${p.service}${p.model === null ? "" : `:${encodeURIComponent(p.model)}`}`;
    const summary = models.get(key) ?? { service: p.service, model: p.model, n: 0, last: p.error.slice(0, 200), latest: p.latest.getTime() };
    summary.n += p.n;
    models.set(key, summary);
  }
  // Earlier versions combined every model under a service key without saving its scope. Freeze the
  // unresolved models once for those existing events; their old timestamps cannot establish that scope.
  for (const [key, incident] of Object.entries(open)) {
    if (!key.startsWith(REFUSED_PREFIX) || key.includes(":") || incident.refusedModels) continue;
    const service = key.slice(REFUSED_PREFIX.length);
    incident.refusedModels = [...models.values()].filter(p => p.service === service).map(p => p.model);
  }
  const refused = new Map<string, { service: string; n: number; last: string; models?: Set<string> }>();
  for (const [modelKey, p] of models) {
    const legacyKey = `${REFUSED_PREFIX}${p.service}`;
    const legacy = open[legacyKey];
    const key = legacy?.refusedModels?.includes(p.model) ? legacyKey : modelKey;
    if (!open[key] && p.latest <= now - 3600_000) continue;
    const summary = refused.get(key) ?? { service: p.service, n: 0, last: p.last, models: new Set<string>() };
    summary.n += p.n;
    if (p.model === null) summary.models = undefined;
    else summary.models?.add(p.model);
    refused.set(key, summary);
  }
  for (const [key, p] of refused) {
    const service = p.service;
    const unused = p.models && !PROVIDERS[service]?.stops && !(await stepsOnService(service, p.models)).length;
    out.push({
      key,
      level: unused ? "later" : "today",
      title: unused ? `${providerName(service)}: an old model restriction is not yet verified` : `${providerName(service)} refuses calls; check the account or quota`,
      impact: unused ? "No current processing step uses these restricted models; the old restriction is still unverified" : await providerStops(service, p.models),
      heals: "Access must be restored first, then check that the failed jobs resumed",
      action: `Check the balance, plan and spending limit in ${providerConsole(service)}; once access is back, confirm one successful call and resume the failed jobs from the admin; if all of that looks fine, start a maintenance run to find the cause`,
      detail: `${p.models ? `models ${[...p.models].join(", ")}; ` : ""}refused ${p.n} times since the last success, with no successful call since: ${p.last}`,
    });
  }
  const capped = await sql<{ service: string; per_day: number; used: number }[]>`
    SELECT b.service, b.per_day, count(a.id)::int AS used FROM budgets b
    JOIN receipt_attempts a ON a.service = b.service AND a.origin = 'live' AND a.started_at > now() - interval '1 day'
    WHERE b.per_day > 0 GROUP BY 1, 2 HAVING count(a.id) >= b.per_day`;
  for (const c of capped) {
    out.push({
      key: `budget.day.${c.service}`,
      level: "later",
      title: `${providerName(c.service)} used up its 24-hour call quota`,
      impact: `${await providerStops(c.service)}, until the quota frees up over time`,
      heals: "Yes, the quota recovers on a rolling 24-hour window",
      action: "Nothing to do this time; if it happens often, decide whether to raise the quota",
      detail: `${c.used} calls in 24 hours, limit ${c.per_day} (budgets table)`,
    });
  }
  return out;
}

interface AlertState {
  [key: string]: { title: string; since: string; sentAt?: string; handoff?: true; refusedModels?: (string | null)[] };
}

const DAILY_PREFIX = "report.daily:";
const dailyDate = (key: string) => key.startsWith(DAILY_PREFIX) && isValidDate(key.slice(DAILY_PREFIX.length))
  ? key.slice(DAILY_PREFIX.length) : undefined;
/** Missing dailies are looked for, and announced ones followed, over the last seven calendar days in the site's zone. */
const dailyScanFrom = (now: number) => addDays(siteDate(now), -6);

async function alertState(): Promise<AlertState> {
  const [row] = await sql<{ value: AlertState }[]>`SELECT value FROM settings WHERE key = 'alerts.state'`;
  return { ...(row?.value ?? {}) };
}

async function dailyReportFindings(now: number, open: AlertState): Promise<Finding[]> {
  if (!collecting() || !modelsOn()) return [];
  const today = siteDate(now);
  const [activity] = await sql<{ first_report: string | null; first_attempt: Date | null }[]>`
    SELECT (SELECT min(key) FROM reports WHERE kind = 'daily') AS first_report,
           (SELECT min(started_at) FROM job_runs WHERE job = 'reports.compose') AS first_attempt`;
  const starts = [activity?.first_report, activity?.first_attempt && siteDate(activity.first_attempt)]
    .filter((date): date is string => !!date && isValidDate(date)).sort();
  const start = starts[0] ?? today;
  // New gaps and announced editions alike are followed for the scan window; settleDailies closes older ones.
  const from = dailyScanFrom(now);
  const dates = new Set(Object.keys(open).map(dailyDate).filter((date): date is string => !!date && date >= from));
  for (let date = from; date <= today; date = addDays(date, 1)) {
    if (date >= start) dates.add(date);
  }
  const overdue = [...dates].filter(date => now >= siteAt(date, EDITION_TIMES.daily).getTime() + 2 * 3600_000).sort();
  if (!overdue.length) return [];
  const published = new Set((await sql<{ key: string }[]>`SELECT key FROM reports WHERE kind = 'daily' AND key IN ${sql(overdue)}`).map(r => r.key));
  return overdue.filter(date => !published.has(date)).map(date => ({
    key: `${DAILY_PREFIX}${date}`, level: "now",
    title: `The ${date} daily report has not been generated`, impact: `Readers cannot see the ${date} daily report`,
    heals: "Not filled in yet; check the run log to see whether it needs to be made by hand",
    action: "Start a maintenance run soon",
    detail: `reports daily ${date} does not exist; see the reports.compose run log`,
  }));
}

/**
 * Announced editions this round did not find, because generation is paused or they fell out of the scan
 * window. Only an edition that exists has recovered (checkAlerts says so); one still missing stays open
 * quietly within the window, and past it is closed with one message instead of being reminded about forever.
 */
async function settleDailies(open: AlertState, found: Set<string>, now: number): Promise<{ missing: Set<string>; sent: string[] }> {
  const missing = new Set<string>();
  const sent: string[] = [];
  const dates = Object.keys(open).filter((key) => !found.has(key)).map(dailyDate).filter((date): date is string => !!date);
  if (!dates.length) return { missing, sent };
  const published = new Set((await sql<{ key: string }[]>`SELECT key FROM reports WHERE kind = 'daily' AND key IN ${sql(dates)}`).map((r) => r.key));
  for (const date of dates.filter((date) => !published.has(date))) {
    const key = `${DAILY_PREFIX}${date}`;
    if (date >= dailyScanFrom(now)) {
      missing.add(key);
      continue;
    }
    await sendAlert(`The ${date} daily report could not be filled in; no more reminders`, [`Readers cannot see the ${date} daily report; missing since ${siteStamp(new Date(open[key]!.since))}, now outside the seven-day check window`]);
    sent.push(`${key}:expired`);
    await closeAgentWake(key);
    delete open[key];
  }
  return { missing, sent };
}

/**
 * Every 10 minutes: new problems and recoveries of the now/today levels go out; follow-ups wait for 09:00.
 */
export async function checkAlerts(now = Date.now()) {
  const state = await alertState();
  const all = await collectFindings(now, state);
  const sent: string[] = [];
  for (const f of all) {
    const open = state[f.key];
    if (f.level === "later") {
      // Switching before the first check changes the impact, not whether access has recovered.
      if (f.key.startsWith(REFUSED_PREFIX) && !open) state[f.key] = { title: f.title, since: new Date(now).toISOString(), handoff: true };
      continue;
    }
    if (open?.sentAt && now - Date.parse(open.sentAt) <= REPEAT_MS[f.level]) continue;
    const since = open ? new Date(open.since) : (f.since ?? new Date(now));
    const msg = formatAlert(f, since, now, !!open?.sentAt);
    await sendAlert(msg.title, msg.lines);
    state[f.key] = { ...open, title: f.title, since: since.toISOString(), sentAt: new Date(now).toISOString(), ...(!open || open.handoff ? { handoff: true as const } : {}) };
    sent.push(f.key);
  }
  const found = new Set(all.map((f) => f.key));
  const dailies = await settleDailies(state, found, now);
  sent.push(...dailies.sent);
  for (const [key, open] of Object.entries(state)) {
    if (found.has(key) || dailies.missing.has(key)) continue;
    if (!open.sentAt) {
      await closeAgentWake(key);
      delete state[key];
      continue;
    }
    const [dropped] = key === "deliveries.failed" ? await sql`SELECT count(*)::int AS n FROM deliveries d
      WHERE d.status='failed' AND d.updated_at>${new Date(Date.parse(open.since)-86400_000)}
        AND EXISTS(SELECT 1 FROM audit_log a WHERE a.action='delivery.drop' AND a.subject='delivery:' || d.id AND a.created_at>=d.updated_at)` : [];
    const msg = formatRecovery(open.title, new Date(open.since), now);
    if (dropped?.n) await sendAlert(`Follow-up ended: ${open.title}`, [`${dropped.n} old notifications will not be resent; delivery unconfirmed`]);
    else await sendAlert(msg.title, msg.lines);
    sent.push(`${key}:${dropped?.n ? "closed" : "recovered"}`);
    await closeAgentWake(key);
    delete state[key];
  }
  await sql`INSERT INTO settings (key, value, updated_by) VALUES ('alerts.state', ${sql.json(state as never)}, 'alerts')
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  // Revisit every open incident: a crash between saving the owner's alert and dispatching cannot lose it.
  // The durable handoff deduplicates by occurrence, independently from hourly owner reminders.
  for (const f of all) if (f.level !== "later" && state[f.key]) await wakeAgent({ ...f, since: new Date(state[f.key]!.since) }, now, !!state[f.key]!.handoff);
  return { open: Object.keys(state), sent };
}

/** A follow-up someone judged not worth fixing: who, when and why. */
export interface DismissedFollowUp { title: string; reason: string; by: string; at: string }

/** The follow-ups closed as not to be fixed, by key. */
async function savedDismissals(): Promise<Record<string, DismissedFollowUp>> {
  const [row] = await sql<{ value: Record<string, DismissedFollowUp> }[]>`SELECT value FROM settings WHERE key = 'alerts.dismissed'`;
  return row?.value ?? {};
}

/** Only observations covered by the closure stay quiet; a new failure reopens the same key. */
export async function dismissedFollowUps(findings?: Finding[]): Promise<Record<string, DismissedFollowUp>> {
  const current = findings ?? await sourceFollowUps(Date.now());
  return Object.fromEntries(Object.entries(await savedDismissals()).filter(([key, closed]) => {
    const finding = current.find(f => f.key === key);
    return finding && (!finding.observedAt || finding.observedAt.getTime() <= Date.parse(closed.at));
  }));
}

/**
 * Closes a current source follow-up as not to be fixed, with the reason (audited): the digest stops listing
 * it. Only these name one source and one problem; a follow-up that counts many records would hide records
 * that arrive later. The closure covers evidence observed by its timestamp only. New failures reopen it even while the old
 * history is still in the seven-day window; disappearance also lapses the closure.
 */
export async function dismissFollowUp(key: string, reason: string, actor: string, now = Date.now()): Promise<DismissedFollowUp> {
  if (!reason?.trim()) throw new Error("reason is required");
  const finding = (await sourceFollowUps(now)).find((f) => f.key === key);
  if (!finding) throw new Error(`not a current source follow-up: ${key}`);
  const before = (await savedDismissals())[key] ?? null;
  const dismissed: DismissedFollowUp = { title: finding.title, reason: reason.trim(), by: actor, at: new Date(now).toISOString() };
  await sql.begin(async (tx) => {
    await tx`INSERT INTO settings (key, value, updated_by) VALUES ('alerts.dismissed', ${tx.json({ [key]: dismissed } as never)}, ${actor})
             ON CONFLICT (key) DO UPDATE SET value = settings.value || EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`;
    await audit(actor, "followup.dismiss", `followup:${key}`, dismissed.reason, before, dismissed, { db: tx });
  });
  return dismissed;
}

/** Undoes a closure (audited): the digest lists the follow-up again while it lasts. Null when it is not closed. */
export async function restoreFollowUp(key: string, reason: string, actor: string): Promise<DismissedFollowUp | null> {
  if (!reason?.trim()) throw new Error("reason is required");
  const before = (await savedDismissals())[key];
  if (!before) return null;
  await sql.begin(async (tx) => {
    await tx`UPDATE settings SET value = value - ${key}::text, updated_by = ${actor}, updated_at = now() WHERE key = 'alerts.dismissed'`;
    await audit(actor, "followup.restore", `followup:${key}`, reason.trim(), before, null, { db: tx });
  });
  return before;
}

/** 09:00: one message with the open follow-ups; nothing when there are none. Closures whose problem is gone lapse here. */
export async function sendDigest(now = Date.now()) {
  const found = (await collectFindings(now)).filter((f) => f.level === "later");
  const dismissed = await dismissedFollowUps(found);
  const lapsed = Object.keys(await savedDismissals()).filter((key) => !dismissed[key]);
  if (lapsed.length) await sql`UPDATE settings SET value = value - ${sql.array(lapsed)}::text[], updated_at = now() WHERE key = 'alerts.dismissed'`;
  const items = found.filter((f) => !dismissed[f.key]);
  const lines = items.map((f, i) => `${i + 1}. ${f.title}${f.detail ? `\n   ${f.detail}` : ""}`);
  if (!lines.length) return { items: 0 };
  await sendAlert(`📋 System daily report · ${siteDay(now)}`, ["These items need follow-up; each line explains its impact. You can hand the whole message to the AI.", ...lines]);
  return { items: lines.length };
}
