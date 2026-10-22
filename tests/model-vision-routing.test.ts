// Which models the admin may choose for a step: only a step that needs images refuses a text model.
import "./setup.ts";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { modelsOverview, switchModel } from "@aihot/backend/admin/models";
import { CAPABILITIES, capabilityAcceptsModel, invalidateModelCache, modelFor } from "@aihot/backend/editorial/models";
import { MODELS } from "@aihot/backend/providers/llm";

const run = promisify(execFile);

after(closeDb);

test("every step takes a model that reads images; only a step that needs images refuses a text model", async () => {
  const understand = CAPABILITIES.understand;
  assert.equal(capabilityAcceptsModel(understand, MODELS["glm-5.3-flash"]!), true);
  assert.equal(capabilityAcceptsModel(understand, MODELS["qwen3-vl-flash"]!), true);
  assert.equal(capabilityAcceptsModel(understand, MODELS["deepseek-flash"]!), true);
  assert.equal(capabilityAcceptsModel(CAPABILITIES.score, MODELS["qwen3-vl-flash"]!), true);
  assert.equal(capabilityAcceptsModel({ ...understand, vision: true }, MODELS["deepseek-flash"]!), false);

  await switchModel("understand", "qwen3-vl-flash", "vision routing test", "test");
  assert.equal(await modelFor("understand"), "qwen3-vl-flash");
  await switchModel("understand", "deepseek-flash", "text routing test", "test");
  assert.equal(await modelFor("understand"), "deepseek-flash");

  const overview = await modelsOverview(1);
  assert.equal(overview.capabilities.find((capability) => capability.key === "understand")?.vision, false);
});

// A mistyped step model must stop the processes, not run the step on another model.
test("an unknown environment model stops the api and worker at startup and fails the step's calls", async () => {
  const before = process.env.UNDERSTAND_MODEL;
  await sql`DELETE FROM settings WHERE key = 'models.understand'`;
  invalidateModelCache();
  try {
    process.env.UNDERSTAND_MODEL = "or-claude-sonnet";
    assert.equal(await modelFor("understand"), "or-claude-sonnet");
    process.env.UNDERSTAND_MODEL = "or-claude-sonet";
    await assert.rejects(modelFor("understand"), /UNDERSTAND_MODEL=or-claude-sonet/);
    for (const app of ["apps/worker/src/main.ts", "apps/api/src/main.ts"]) {
      const exit = await run(process.execPath, [app], { env: process.env, timeout: 30_000 }).then(() => null, (error: { code?: number; stderr: string }) => error);
      assert.ok(exit && exit.code !== 0, `${app} exits non-zero`);
      assert.match(exit.stderr, /Unknown model in UNDERSTAND_MODEL=or-claude-sonet/, app);
    }
  } finally {
    if (before === undefined) delete process.env.UNDERSTAND_MODEL; else process.env.UNDERSTAND_MODEL = before;
  }
});
