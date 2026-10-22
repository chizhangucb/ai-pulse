// A paused external source must not accept new reports or look healthy after a rejected push.
import { pointModels, stub, tag } from "./setup.ts";
import { analysisStep, SELECTING_SCORE } from "./analysis-steps.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { IngestError, ingestItems } from "@aihot/backend/ingest/items";
import { processArticle } from "@aihot/backend/jobs/content";
import { stopBoss } from "@aihot/backend/jobs/queue";

const steps: string[] = [];
const provider = await stub((_hit, request) => {
  const step = analysisStep(request.body);
  steps.push(step);
  const output = step === "prefilter" ? { label: "PASS", reason: "fixture" }
    : step === "score" ? { attentionScore: SELECTING_SCORE }
    : step === "structure" ? { scope: "single", category: "model", tags: [], subjects: [], fact: null }
    : { itemType: "model_release", authorRole: "principal", titleZh: "OpenAI releases a new API model", summaryZh: "OpenAI says the new API model is faster and cheaper.", bodyZh: "OpenAI says the new API model is faster and cheaper.", tags: [], editorialJudgment: "fixture" };
  return { choices: [{ message: { content: JSON.stringify(output) } }] };
});
pointModels(provider.url);

after(async () => {
  await provider.close();
  await stopBoss();
  await closeDb();
});

test("a paused external source rejects pushed items without recording a successful fetch", async () => {
  const sourceId = `test-paused-ingest-${tag()}`;
  const lastOkAt = new Date("2026-09-01T00:00:00Z");
  await sql`
    INSERT INTO sources (id, name, kind, config, tier, participation_mode, enabled, health, last_ok_at)
    VALUES (${sourceId}, 'Paused external source', 'external', '{}'::jsonb, 'T2', 'editorial', false, 'paused', ${lastOkAt})`;

  await assert.rejects(
    ingestItems({ sourceId, items: [{ title: "New report", url: `https://example.org/${sourceId}` }] }),
    (error: unknown) => error instanceof IngestError && error.status === 409,
  );

  const [source] = await sql<{ last_ok_at: Date }[]>`SELECT last_ok_at FROM sources WHERE id = ${sourceId}`;
  const [articles] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM articles WHERE source_id = ${sourceId}`;
  assert.equal(source!.last_ok_at.toISOString(), lastOkAt.toISOString());
  assert.equal(articles!.count, 0);

  await sql`UPDATE sources SET enabled = true WHERE id = ${sourceId}`;
  assert.deepEqual(await ingestItems({ sourceId, items: [{ title: "New report", url: `https://example.org/${sourceId}` }] }), { ok: true, created: 1 });
});

test("an externally reported calendar day stays date-only through storage", async () => {
  const sourceId = `test-date-ingest-${tag()}`;
  await ingestItems({ sourceId, items: [{ title: "Calendar day", url: `https://example.org/${sourceId}`, publishedAt: "2026-10-13" }] });
  const [row] = await sql`SELECT publication_time, published_at_claim FROM articles WHERE source_id=${sourceId}`;
  assert.equal(row!.publication_time, "2026-10-13");
  assert.equal(row!.published_at_claim.toISOString(), "2026-10-13T00:00:00.000Z");
});

test("a pushed X post from a seeded account goes to the same analysis queue as collected items", async () => {
  const sourceId = `x-test-${tag()}`;
  await sql`
    INSERT INTO sources (id, name, kind, config, tier, owner_entity_id, participation_mode, enabled, health)
    VALUES (${sourceId}, 'X: Test Lab (@testlab)', 'external', '{"publisherRole":"organization"}'::jsonb, 'T1_5', 'openai', 'editorial', true, 'ok')`;
  const url = `https://x.com/testlab/status/${Date.now()}`;
  assert.deepEqual(await ingestItems({ sourceId, items: [{ title: "We are releasing a new open-weights model today.", url, publishedAt: new Date().toISOString(), author: "testlab" }] }), { ok: true, created: 1 });

  const [article] = await sql<{ id: string }[]>`SELECT id FROM articles WHERE source_id = ${sourceId}`;
  const jobs = await sql<{ name: string }[]>`SELECT name FROM pgboss.job WHERE data->>'articleId' = ${article!.id}`;
  assert.deepEqual(jobs.map((j) => j.name), ["content.analyze"]);
});

test("the documented X payload, a post URL with only a title, is judged by the model without a page fetch", async () => {
  const sourceId = `x-docs-${tag()}`;
  await sql`
    INSERT INTO sources (id, name, kind, config, tier, participation_mode, enabled, health)
    VALUES (${sourceId}, 'X: OpenAI (@OpenAI)', 'external', '{}'::jsonb, 'T1', 'editorial', true, 'ok')`;
  const title = "We are releasing a new model in the API today. It is faster and cheaper than the last one.";
  await ingestItems({ sourceId, items: [{ title, url: `https://x.com/OpenAI/status/${Date.now()}`, publishedAt: new Date().toISOString(), author: "OpenAI" }] });
  const [article] = await sql<{ id: string; body_text: string }[]>`SELECT id, body_text FROM articles WHERE source_id = ${sourceId}`;
  assert.equal(article!.body_text, title);

  steps.length = 0;
  assert.deepEqual(await processArticle(article!.id, { attemptTag: tag() }), { state: "pass" });
  assert.equal(steps.filter((step) => step === "score").length, 2);
});

test("pushed text or body is the article text; a title alone off X still waits for its page", async () => {
  const sourceId = `test-text-ingest-${tag()}`;
  await ingestItems({ sourceId, items: [
    { title: "Launch post", text: "The full launch post.", url: `https://example.org/${sourceId}/text` },
    { title: "Paper", body: "The paper's abstract.", url: `https://example.org/${sourceId}/body` },
    { title: "Title only", url: `https://example.org/${sourceId}/title` },
  ] });
  const rows = await sql<{ title: string; body_text: string | null; body_status: string }[]>`
    SELECT title, body_text, body_status FROM articles WHERE source_id = ${sourceId} ORDER BY title`;
  assert.deepEqual(rows.map((r) => [r.title, r.body_text, r.body_status]), [
    ["Launch post", "The full launch post.", "ok"],
    ["Paper", "The paper's abstract.", "ok"],
    ["Title only", null, "pending"],
  ]);
});
