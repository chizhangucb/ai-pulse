// Seeds a fresh site from the industry pack: the demo sources (industry/sources.json) and one external source per
// X account in industry/x-accounts.json (its posts are pushed through POST /api/ingest/items), only the ones not
// there yet, so admin edits are never undone. Topics need no seeding: they are read from industry/topics.json.
// Re-runnable:  node --env-file=.env scripts/seed.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
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
await closeDb();
