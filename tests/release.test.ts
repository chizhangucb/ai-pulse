// Failure mode: Railway resolves AIHOT_RELEASE to an empty string, so /api/health and the heartbeat report
// release "" instead of the commit Railway built.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { startHeartbeat } from "@aihot/backend/operations/heartbeat";
import { buildApp } from "../apps/api/src/app.ts";

const T = tag();
const app = await buildApp();
const savedEnv = { AIHOT_RELEASE: process.env.AIHOT_RELEASE, RAILWAY_GIT_COMMIT_SHA: process.env.RAILWAY_GIT_COMMIT_SHA };
after(async () => {
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await sql`DELETE FROM settings WHERE key = ${`heartbeat.release-${T}`}`;
  await app.close();
  await stopBoss();
  await closeDb();
});

async function reported() {
  const health = (await app.inject({ method: "GET", url: "/api/health" })).json().release;
  const timer = startHeartbeat(`release-${T}`);
  clearInterval(timer);
  let beat: { release: string } | undefined;
  for (let i = 0; i < 50 && !beat; i++) {
    [beat] = (await sql`SELECT value FROM settings WHERE key = ${`heartbeat.release-${T}`}`).map((r) => r.value);
    if (!beat) await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await sql`DELETE FROM settings WHERE key = ${`heartbeat.release-${T}`}`;
  return { health, heartbeat: beat?.release };
}

test("an empty AIHOT_RELEASE falls through to Railway's commit, then to dev", async () => {
  process.env.AIHOT_RELEASE = "";
  process.env.RAILWAY_GIT_COMMIT_SHA = "4f1c2e9";
  assert.deepEqual(await reported(), { health: "4f1c2e9", heartbeat: "4f1c2e9" });

  process.env.RAILWAY_GIT_COMMIT_SHA = "";
  assert.deepEqual(await reported(), { health: "dev", heartbeat: "dev" });

  process.env.AIHOT_RELEASE = "9a8b7c6";
  process.env.RAILWAY_GIT_COMMIT_SHA = "4f1c2e9";
  assert.deepEqual(await reported(), { health: "9a8b7c6", heartbeat: "9a8b7c6" });
});
