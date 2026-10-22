import { assertProductionSecrets, config } from "@aihot/backend/config";
import { closeDb } from "@aihot/backend/db";
import { getBoss, stopBoss } from "@aihot/backend/jobs/queue";
import { registerNotifyJobs } from "@aihot/backend/jobs/notify";
import { registerSchedules } from "@aihot/backend/jobs/schedules";
import { ensureContentTargets } from "@aihot/backend/notify/deliver";
import { installModules } from "@aihot/backend/modules";
import { assertModelChoices } from "@aihot/backend/editorial/models";
import { SERVER_MODULES } from "@aihot/site/modules/server";
import { DEPLOYMENT } from "@aihot/site";
import { feishuLoginConfigured } from "@aihot/backend/admin/auth";
import { startHeartbeat } from "@aihot/backend/operations/heartbeat";
import { startWorkerWatchdog } from "@aihot/backend/operations/watch";
import { buildApp } from "./app.ts";

installModules(SERVER_MODULES);
assertModelChoices();
assertProductionSecrets([
  ["auth", "SESSION_SECRET"],
  ["auth", "IMG_PROXY_SIGN_SECRET"],
  ...DEPLOYMENT.requiredSecrets,
]);
// Somebody must be able to sign in to the admin.
if (config.environmentName === "production" && !(config.adminPassword && config.adminPassword.length >= 12) && !feishuLoginConfigured()) {
  throw new Error("Refusing to start in production: set ADMIN_PASSWORD (at least 12 characters) or configure Feishu sign-in");
}

const app = await buildApp();
await app.listen({ port: config.apiPort, host: process.env.API_HOST || "127.0.0.1" });
startHeartbeat(`api:${config.apiPort}`);
startWorkerWatchdog();
// Jobs that read or write config.dataDir run here: the api is the only process with that disk.
await ensureContentTargets();
const boss = await getBoss();
await registerNotifyJobs(boss);
await registerSchedules(boss, "api");

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  await app.close();
  await stopBoss();
  await closeDb();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
