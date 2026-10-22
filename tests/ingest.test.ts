// A paused external source must not accept new reports or look healthy after a rejected push.
import "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { IngestError, ingestItems } from "@aihot/backend/ingest/items";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { tag } from "./setup.ts";

after(async () => {
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
