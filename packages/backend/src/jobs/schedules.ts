// Cron-style schedules (the site's time zone), the engine's and then the site's modules'. Each run is recorded in
// job_runs; missed slots run once. A schedule that reads or writes config.dataDir runs in the api, the only
// process with that disk; the rest, and every module's, run in the worker.
import type { PgBoss } from "pg-boss";
import { SITE_TIMEZONE } from "@aihot/contracts/time";
import { ensureQueue, recordRun } from "./queue.ts";
import { serverModules, type Scheduled } from "../modules.ts";
import { sweepUnprocessed } from "./content.ts";
import { translatePending } from "../editorial/translate.ts";
import { adaptIntervals, scheduleDueSources } from "../sources/collect.ts";
import { scheduleMpReconcile } from "../sources/mp.ts";
import { followXRenames } from "../sources/x-renames.ts";
import { dajialaConfigured } from "../providers/dajiala.ts";
import { refreshSourceIcons } from "../sources/icons.ts";
import { computeHotRanking, snapshotHeat } from "../events/hot.ts";
import { linkRelatedStories } from "../events/consolidate.ts";
import { composeDueReports } from "../reports/compose.ts";
import { dailyRetention } from "../operations/retention.ts";
import { submitIndexNow } from "../operations/indexnow.ts";
import { checkAlerts, sendDigest } from "../operations/alerts.ts";
import { recoverStaleWork } from "../operations/recover.ts";
import { forwardPendingFeedback } from "../operations/feedback.ts";
import { backupConfigured, runBackup } from "../operations/backup.ts";
import { sourceHealthWeekly } from "../operations/reports.ts";

export type ScheduleProcess = "api" | "worker";

/** A conditional `disk` schedule uses `when` rather than being left out, so the worker still knows its queue and keeps it. */
type EngineSchedule = Scheduled & { disk?: true };

const collecting = process.env.COLLECT_ENABLED === "true";

const ENGINE_SCHEDULES: EngineSchedule[] = [
  { name: "content.sweep", cron: "*/5 * * * *", run: sweepUnprocessed },
  // Full-text translations of newly selected items (model calls; off with MODEL_CALLS_ENABLED=false).
  { name: "content.translate", cron: "*/5 * * * *", run: () => translatePending() },
  { name: "hot.rank", cron: "*/5 * * * *", run: () => computeHotRanking() },
  { name: "hot.snapshot", cron: "2 * * * *", run: () => snapshotHeat() },
  { name: "stories.links", cron: "12 * * * *", run: linkRelatedStories },
  // Every issue that is due and not written yet, each from its edition time (site/site.ts EDITION_TIMES)
  // at the next half hour; a missed or failed one at the next run.
  { name: "reports.compose", cron: "0,30 * * * *", missed: "once", run: () => composeDueReports() },
  // The deletions the privacy notice promises, once their retention periods are over.
  { name: "ops.retention", cron: "30 3 * * *", missed: "once", disk: true, run: () => dailyRetention() },
  // IndexNow for added, changed and removed discovery URLs, hourly so a new story or report reaches Bing,
  // and the AI answers that search it, within the hour (off unless INDEXNOW_SUBMIT_ENABLED).
  { name: "seo.indexnow", cron: "50 * * * *", missed: "once", run: () => submitIndexNow() },
  // Work a stopped process left half way becomes visible, and unknown paid requests get their one
  // automatic release; ops.alerts runs in parallel and sees the result by its next run at the latest.
  { name: "ops.recover", cron: "*/10 * * * *", run: () => recoverStaleWork() },
  { name: "ops.alerts", cron: "*/10 * * * *", run: () => checkAlerts() },
  // One message with other follow-ups and their actual impact (nothing when there are none).
  { name: "ops.digest", cron: "0 9 * * *", missed: "once", run: () => sendDigest() },
  // Feedback that did not reach the internal Feishu chat when it was sent (off with FEISHU_INTERNAL_ENABLED).
  { name: "feedback.forward", cron: "*/10 * * * *", disk: true, run: () => forwardPendingFeedback() },
  { name: "ops.backup", cron: "10 4 * * *", missed: "once", disk: true, when: backupConfigured, run: () => runBackup() },
  { name: "reports.source-health", cron: "0 9 * * 1", missed: "once", run: () => sourceHealthWeekly() },
  ...(collecting
    ? [
        { name: "sources.schedule", cron: "* * * * *", run: () => scheduleDueSources() },
        { name: "sources.adapt-intervals", cron: "20 4 * * *", run: adaptIntervals },
        // X accounts quiet for a day: a renamed one is followed to its new handle (SocialData, paid per lookup).
        { name: "sources.x-renames", cron: "50 4 * * *", missed: "once" as const, run: () => followXRenames() },
        // Icons are read from the sources' own sites, so they stop with collection.
        { name: "sources.icons", cron: "40 4 * * *", missed: "once" as const, run: () => refreshSourceIcons() },
      ]
    : []),
  // WeChat official accounts through Dajiala (paid), each once per its interval; only with its key.
  ...(collecting && dajialaConfigured() ? [{ name: "sources.mp-reconcile", cron: "*/15 * * * *", run: () => scheduleMpReconcile() }] : []),
];

function owned(owner: ScheduleProcess): Scheduled[] {
  const engine = ENGINE_SCHEDULES.filter((s) => (s.disk ? "api" : "worker") === owner);
  return owner === "worker" ? [...engine, ...serverModules().flatMap((m) => m.schedules ?? [])] : engine;
}

const queueOf = (s: Scheduled) => `cron.${s.name}`;

export async function registerSchedules(boss: PgBoss, owner: ScheduleProcess) {
  const mine = owned(owner);
  const schedules = mine.filter((s) => s.when?.() ?? true);
  for (const s of schedules) {
    const queue = queueOf(s);
    await ensureQueue(queue, { policy: "singleton", retryLimit: 1, expireInSeconds: 3600 });
    await boss.schedule(queue, s.cron, {}, { tz: SITE_TIMEZONE, missed: s.missed ?? "skip" });
    // Schedules fire at minute boundaries; a 15 s pickup keeps them on time with a third of the polling.
    await boss.work(queue, { pollingIntervalSeconds: 15 }, async () => recordRun(s.name, s.run));
  }
  // Retired or disabled timers must leave no queued work behind, including queues an earlier release
  // already unscheduled. pg-boss deletes the queue's jobs and schedules; job_runs retains its audit.
  // Each process retires its own disabled timers, since `when` reads its own environment; the worker also
  // retires names that neither process has any more.
  const current = new Set(schedules.map(queueOf));
  const disabled = new Set(mine.map(queueOf).filter((name) => !current.has(name)));
  const known = new Set([...mine, ...owned("api")].map(queueOf));
  for (const old of await boss.getQueues()) {
    if (disabled.has(old.name) || (owner === "worker" && old.name.startsWith("cron.") && !known.has(old.name))) await boss.deleteQueue(old.name);
  }
}
