// Fetches every rss, web_list and json_list source in industry/sources.json (or the file given) the way the admin
// "preview" does, stores nothing, and prints how many items each returns and its newest one. Exits 1 when any
// source fails or returns no items. Needs a migrated database (DATABASE_URL); makes no model calls.
//   node --env-file=.env scripts/check-sources.ts [path/to/sources.json] [--only id,id]
import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { closeDb } from "@aihot/backend/db";
import { previewSource } from "@aihot/backend/admin/sources";
import type { SourceRow } from "@aihot/backend/sources/types";

const args = process.argv.slice(2);
const onlyAt = args.indexOf("--only");
const only = onlyAt >= 0 ? new Set(args[onlyAt + 1]!.split(",")) : null;
const file = args.find((a, i) => !a.startsWith("--") && (onlyAt < 0 || i !== onlyAt + 1)) ?? path.join(REPO_ROOT, "industry/sources.json");
const { sources } = JSON.parse(readFileSync(file, "utf8")) as { sources: Array<Pick<SourceRow, "id" | "name" | "kind" | "config" | "tier">> };

let failed = 0;
for (const s of sources) {
  if (only && !only.has(s.id)) continue;
  if (!["rss", "web_list", "json_list"].includes(s.kind)) {
    console.log(`SKIP ${s.id} (${s.kind})`);
    continue;
  }
  try {
    const r = await previewSource(s);
    const newest = r.items.map((i) => i.publishedAt).filter(Boolean).sort().at(-1) ?? "no dates";
    const ok = r.count > 0;
    if (!ok) failed++;
    console.log(`${ok ? "OK  " : "EMPTY"} ${s.id} items=${r.count} newest=${newest} ${r.ms}ms | ${r.items[0]?.title.slice(0, 80) ?? ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${s.id} ${String(error).slice(0, 200)}`);
  }
}
await closeDb();
process.exit(failed ? 1 : 0);
