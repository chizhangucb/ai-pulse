// scripts/seed.ts runs at every start and after every upgrade. Failure cases: a site upgraded from the Chinese
// release keeps showing Chinese names in the admin, an admin's own text is overwritten, a receipt that was
// already released automatically under the old note is released a second time, or a retired demo source keeps
// collecting (or is paused again after an admin turned it back on).
import "./setup.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { updateSource } from "@aihot/backend/admin/sources";
import { autoReleaseUnknownReceipts } from "@aihot/backend/operations/recover";

after(closeDb);

const seed = () => execFileSync(process.execPath, ["scripts/seed.ts"], { env: process.env, encoding: "utf8" });

test("an upgraded site gets English names once, keeps admin edits, and does not release a receipt twice", async () => {
  await sql`INSERT INTO notify_targets (key, purpose, kind, note) VALUES
    ('feishu-content-main', 'content', 'feishu_webhook', '飞书内容主群'), ('feishu-content-mirror', 'content', 'feishu_webhook', 'Ops mirror')
    ON CONFLICT (key) DO UPDATE SET note = EXCLUDED.note`;
  await sql`INSERT INTO admin_users (email, display_name) VALUES ('admin@local', '管理员')`;
  const [receipt] = await sql<{ id: number }[]>`INSERT INTO receipts (logical_key, service, purpose, subject, status, updated_at)
    VALUES ('seed-released-once', 'deepseek', 'event_identity', 'article:seed', 'unknown', now() - interval '2 hours') RETURNING id`;
  await sql`INSERT INTO receipt_attempts (receipt_id, service, attempt, status, error)
    VALUES (${receipt!.id}, 'deepseek', 1, 'failed', '自动放行：结果未知超过 30 分钟，未核对是否计费 (attempt 1)')`;

  assert.match(seed(), /renamed: 3 rows stored in Chinese/);
  assert.deepEqual((await sql`SELECT key, note FROM notify_targets ORDER BY key`).map((r) => [r.key, r.note]),
    [["feishu-content-main", "Feishu content group (main)"], ["feishu-content-mirror", "Ops mirror"]]);
  assert.equal((await sql`SELECT display_name FROM admin_users WHERE email = 'admin@local'`)[0]!.display_name, "Admin");
  assert.equal((await sql`SELECT error FROM receipt_attempts WHERE receipt_id = ${receipt!.id}`)[0]!.error,
    "Released automatically: result unknown for over 30 minutes, billing not checked (attempt 1)");
  assert.equal((await autoReleaseUnknownReceipts()).released, 0, "released once already, so it waits for an admin");

  assert.match(seed(), /renamed: 0 rows stored in Chinese/);
});

test("a retired demo source is paused once on an upgraded site and never created on a fresh one", async () => {
  seed();
  assert.equal((await sql`SELECT 1 FROM sources WHERE id = 'web-meta-ai-blog'`).length, 0, "a fresh site never gets it");
  await sql`INSERT INTO sources (id, name, kind, config, tier, enabled) VALUES
    ('web-meta-ai-blog', 'Meta AI Blog', 'rss', ${sql.json({ feedUrl: "https://ai.meta.com/blog/" })}, 'T1', true)`;
  const state = async () => (await sql`SELECT enabled, health, updated_at FROM sources WHERE id = 'web-meta-ai-blog'`)[0]!;

  assert.match(seed(), /sources: 1 retired/);
  assert.deepEqual([(await state()).enabled, (await state()).health], [false, "paused"]);
  await updateSource("web-meta-ai-blog", { patch: { enabled: true }, version: (await state()).updated_at.toISOString(), reason: "still useful" }, "admin:1");
  assert.match(seed(), /sources: 0 retired/);
  assert.equal((await state()).enabled, true, "the admin's choice stands");
});
