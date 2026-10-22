// The engine's own model: one OpenAI-compatible model (LLM_BASE_URL, LLM_API_KEY, LLM_MODEL) runs every
// step of the analysis when nothing picks another one for a step.
import { stub, tag } from "./setup.ts";
import { analysisStep, SELECTING_SCORE, type AnalysisStep } from "./analysis-steps.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { analyzeArticle } from "@aihot/backend/editorial/analyze";
import { CAPABILITIES, type Capability } from "@aihot/backend/editorial/models";
import { stopBoss } from "@aihot/backend/jobs/queue";

// Nothing chosen per step: every capability falls back to the `default` model (a step the site
// gives a model of its own is sent back to it by its environment variable).
for (const c of Object.values(CAPABILITIES) as Capability[]) {
  if (c.default === "default") delete process.env[c.env];
  else process.env[c.env] = "default";
}

const T = tag();
const SOURCE = `test-default-model-${T}`;
type Body = { model: string; reasoning?: unknown; max_tokens?: number; response_format?: unknown };
const seen: Array<{ body: Body; step: AnalysisStep }> = [];
let calls = 0;
const provider = await stub((_hit, req) => {
  const step = analysisStep(req.body);
  seen.push({ body: JSON.parse(req.body) as Body, step });
  const content =
    step === "prefilter" ? { label: "PASS", reason: "测试" }
    : step === "score" ? { attentionScore: SELECTING_SCORE }
    : step === "understand" ? { itemType: "product_launch", authorRole: "principal", tags: ["Product update"], editorialJudgment: "理由", titleZh: "一个模型的标题", summaryZh: "一个模型写的摘要。第二句。" }
    : step === "structure" ? { category: "ai-products", tags: ["Product update"], subjects: [], fact: null }
    : "title_zh: 标题\nsummary_zh: 摘要。";
  return { id: `stub-${++calls}`, choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
});
Object.assign(process.env, { LLM_BASE_URL: `${provider.url}/v1`, LLM_API_KEY: "test-key", LLM_MODEL: "one-model", MODEL_CALLS_ENABLED: "true" });

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at) VALUES (${SOURCE}, 'Test default model', 'rss', 'T1', 'editorial', '2100-01-01')`;
});
after(async () => {
  await provider.close();
  await stopBoss();
  await closeDb();
});

test("one model runs the prefilter, both scores, the writing and the structure", async () => {
  seen.length = 0;
  const { articleId } = await upsertMaterial({
    sourceId: SOURCE, url: `https://example.com/${T}`, title: `A product launch ${T}`, bodyText: `A company launched a product with pricing and availability. ${T} `.repeat(6),
    bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
  } as never);
  const res = await analyzeArticle(articleId);
  assert.equal(res!.output!.selected, true);
  assert.equal(res!.output!.titleZh, "一个模型的标题");
  assert.deepEqual(seen.map((r) => r.step).sort(), ["prefilter", "score", "score", "structure", "understand"]);
  assert.ok(seen.every((r) => r.body.model === "one-model"), "every request names the configured model");
  const services = await sql<{ service: string }[]>`SELECT DISTINCT service FROM receipts WHERE subject LIKE ${`article:${articleId}%`}`;
  assert.deepEqual(services.map((s) => s.service), ["llm"]);
});

// A preset sends its own fields: LLM_EXTRA_JSON belongs to the default model alone.
test("UNDERSTAND_MODEL=or-claude-sonnet writes with Sonnet while the other steps keep the default model", async () => {
  const envs = Object.fromEntries(["UNDERSTAND_MODEL", "LLM_MODEL", "LLM_EXTRA_JSON"].map((key) => [key, process.env[key]]));
  Object.assign(process.env, { UNDERSTAND_MODEL: "or-claude-sonnet", LLM_MODEL: "anthropic/claude-haiku-5.5", LLM_EXTRA_JSON: JSON.stringify({ reasoning: { enabled: false } }) });
  seen.length = 0;
  try {
    const { articleId } = await upsertMaterial({
      sourceId: SOURCE, url: `https://example.com/sonnet-${T}`, title: `A product launch written by Sonnet ${T}`, bodyText: `A company launched a product with pricing and availability. Sonnet ${T} `.repeat(6),
      bodyStatus: "ok", via: "fetch", publishedAt: new Date(),
    } as never);
    const res = await analyzeArticle(articleId);
    assert.equal(res!.output!.selected, true);
    assert.deepEqual(seen.map((r) => r.step).sort(), ["prefilter", "score", "score", "structure", "understand"]);
    const understand = seen.find((r) => r.step === "understand")!.body;
    assert.equal(understand.model, "anthropic/claude-sonnet-5.5");
    assert.equal("reasoning" in understand, false);
    assert.equal(understand.max_tokens, 16384);
    assert.deepEqual(understand.response_format, { type: "json_object" });
    for (const { step, body } of seen.filter((r) => r.step !== "understand")) {
      assert.equal(body.model, "anthropic/claude-haiku-5.5", step);
      assert.deepEqual(body.reasoning, { enabled: false }, step);
    }
    const services = await sql<{ service: string }[]>`SELECT DISTINCT service FROM receipts WHERE subject LIKE ${`article:${articleId}%`}`;
    assert.deepEqual(services.map((s) => s.service).sort(), ["llm", "openrouter"]);
  } finally {
    for (const [key, value] of Object.entries(envs)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
