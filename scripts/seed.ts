// Seeds a fresh site from the industry pack: the demo sources (industry/sources.json) and one external source per
// X account in industry/x-accounts.json (its posts are pushed through POST /api/ingest/items), only the ones not
// there yet, so admin edits are never undone. Topics need no seeding: they are read from industry/topics.json.
// On an upgraded site it also pauses retired demo sources once and renames text the Chinese release stored.
// Re-runnable:  node --env-file=.env scripts/seed.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { updateSource } from "@aihot/backend/admin/sources";
import { AUTO_RELEASE_NOTE } from "@aihot/backend/operations/recover";
import { assertSupportedConfig } from "@aihot/backend/sources/config-keys";

interface SeedSource {
  id: string;
  name: string;
  kind: "rss" | "web_list" | "json_list" | "x_search" | "mp_account" | "external";
  config: Record<string, unknown>;
  tier?: string;
  owner_entity_id?: string | null;
  participation_mode?: string;
  interval_minutes?: number;
  tags?: string[];
  site_fulltext?: boolean;
  syndicate_fulltext?: boolean;
  enabled?: boolean;
}

interface XAccount {
  handle: string;
  name: string;
  tier: string;
  owner_entity_id?: string;
  publisherRole?: "organization" | "person";
}

const read = <T>(file: string): T => JSON.parse(readFileSync(path.join(REPO_ROOT, file), "utf8")) as T;
const { accounts } = read<{ accounts: XAccount[] }>("industry/x-accounts.json");
// Pushed accounts are editorial from the start; an unknown sourceId pushed to the endpoint is created isolated.
const xSources: SeedSource[] = accounts.map((a) => ({
  id: `x-${a.handle.toLowerCase()}`,
  name: `X: ${a.name} (@${a.handle})`,
  kind: "external",
  config: a.publisherRole ? { publisherRole: a.publisherRole } : {},
  tier: a.tier,
  owner_entity_id: a.owner_entity_id ?? null,
  participation_mode: "editorial",
  interval_minutes: 60,
  tags: ["X"],
}));
const sources = [...read<{ sources: SeedSource[] }>("industry/sources.json").sources, ...xSources];
let added = 0;
for (const s of sources) {
  assertSupportedConfig(s.kind, s.config);
  const tier = s.tier ?? "T2";
  // First-party means a T1 source, as the admin sets it.
  const inserted = await sql`
    INSERT INTO sources (id, name, kind, config, tier, first_party, owner_entity_id, participation_mode, interval_minutes, tags, site_fulltext, syndicate_fulltext, enabled, next_fetch_at)
    VALUES (${s.id}, ${s.name}, ${s.kind}, ${sql.json(s.config as never)}, ${tier}, ${tier === "T1"}, ${s.owner_entity_id ?? null},
            ${s.participation_mode ?? "editorial"}, ${s.interval_minutes ?? 60}, ${s.tags ?? []}, ${s.site_fulltext ?? false}, ${s.syndicate_fulltext ?? false},
            ${s.enabled ?? true}, now())
    ON CONFLICT (id) DO NOTHING RETURNING id`;
  added += inserted.length;
}
console.log(`sources: ${added} added, ${sources.length - added} already there`);

// Demo sources that stopped working, paused the way the admin pauses one (stored articles stay). Each is paused
// once: its audit entry from the seed marks it done, so an admin who turns it back on is not overruled.
const RETIRED: Record<string, string> = { "web-meta-ai-blog": "The ai.meta.com/blog/ index stopped listing new posts; replaced by rss-meta-newsroom-ai" };
let retired = 0;
for (const [id, reason] of Object.entries(RETIRED)) {
  const [s] = await sql<{ updated_at: Date }[]>`SELECT updated_at FROM sources WHERE id = ${id} AND enabled
    AND NOT EXISTS (SELECT 1 FROM audit_log WHERE actor = 'script:seed' AND subject = ${`source:${id}`})`;
  if (s && await updateSource(id, { patch: { enabled: false }, version: s.updated_at.toISOString(), reason }, "script:seed")) retired += 1;
}
console.log(`sources: ${retired} retired`);

// Text that earlier releases stored in Chinese. Release migrations take no data updates, so the seed renames it;
// a value an admin has since changed is left alone. The auto-release note is matched by prefix to release a receipt only once.
const OLD_AUTO_RELEASE_NOTE = "自动放行：结果未知超过 30 分钟，未核对是否计费";
const renamed = [
  await sql`UPDATE notify_targets SET note = 'Feishu content group (main)' WHERE key = 'feishu-content-main' AND note = '飞书内容主群'`,
  await sql`UPDATE notify_targets SET note = 'Feishu content group (mirror)' WHERE key = 'feishu-content-mirror' AND note = '飞书内容镜像群'`,
  await sql`UPDATE admin_users SET display_name = 'Admin' WHERE email = 'admin@local' AND display_name = '管理员'`,
  await sql`UPDATE receipt_attempts SET error = ${AUTO_RELEASE_NOTE} || substr(error, ${OLD_AUTO_RELEASE_NOTE.length + 1})
    WHERE error LIKE ${OLD_AUTO_RELEASE_NOTE + "%"}`,
].reduce((sum, result) => sum + result.count, 0);
console.log(`renamed: ${renamed} rows stored in Chinese`);
await closeDb();
