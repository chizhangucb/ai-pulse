import { SITE, SOURCE_DEFAULTS } from "@aihot/site";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Route } from "./+types/source-new";
import type { AdminSourceCreated, AdminSourcePreview } from "@aihot/contracts/admin";
import { useAdminAction } from "../../features/admin/action";
import { wallTime } from "../../features/admin/format";
import { KIND_LABEL, MODE_LABEL, TIER_LABEL } from "../../features/admin/labels";
import { AdminPage, Button, Card, Empty, Field, Input, Select, Textarea } from "../../features/admin/ui";

export const meta: Route.MetaFunction = () => [{ title: `New source · ${SITE.name} admin` }];

const TEMPLATES: Record<string, Record<string, unknown>> = {
  rss: { feedUrl: "https://example.com/feed.xml" },
  web_list: { url: "https://example.com/blog", baseUrl: "https://example.com", itemSelector: "article", linkSelector: "a", titleSelector: "h2", allowUrlPrefixes: ["https://example.com/blog/"] },
  json_list: { url: "https://example.com/api/posts", mode: "json_api", method: "GET", itemsPath: "data.items", titlePaths: ["title"], urlTemplate: "{raw:url}", summaryPaths: ["summary"] },
  x_search: { query: "from:handle -filter:replies", searchType: "Latest" },
  mp_account: { ghid: "gh_", nickname: "" },
  external: {},
};


export default function NewSource() {
  const navigate = useNavigate();
  const { run, pending } = useAdminAction();
  const [form, setForm] = useState({ id: "", name: "", kind: "rss", tier: "T2", participation_mode: "editorial", interval_minutes: 30, first_party: false, site_fulltext: SOURCE_DEFAULTS.siteFulltext, syndicate_fulltext: false, tags: "" });
  const [config, setConfig] = useState(JSON.stringify(TEMPLATES.rss, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AdminSourcePreview | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);

  const parsed = () => {
    try {
      setError(null);
      return JSON.parse(config) as Record<string, unknown>;
    } catch (e) {
      setError(`The config is not valid JSON: ${(e as Error).message}`);
      return null;
    }
  };

  return (
    <AdminPage title="New source" subtitle="Check for duplicates and preview first. Prefer stable formats such as RSS or JSON; a source is set up once its first fetch succeeds with real items. First-party status needs evidence of who runs it or an official cross-link.">
      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <Card title="Source">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ID" hint="Lower-case letters, digits and hyphens; cannot change later">
              <Input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value.toLowerCase() })} placeholder="openai-blog" />
            </Field>
            <Field label="Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="OpenAI Blog" />
            </Field>
            <Field label="Kind">
              <Select
                value={form.kind}
                onChange={(e) => {
                  setForm({ ...form, kind: e.target.value });
                  setConfig(JSON.stringify(TEMPLATES[e.target.value] ?? {}, null, 2));
                  setPreview(null);
                }}
              >
                {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Interval (minutes)">
              <Input type="number" min={1} max={1440} value={form.interval_minutes} onChange={(e) => setForm({ ...form, interval_minutes: Number(e.target.value) })} />
            </Field>
            <Field label="Participation">
              <Select value={form.participation_mode} onChange={(e) => setForm({ ...form, participation_mode: e.target.value })}>
                {Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Tier" hint="Only T1 is first party">
              <Select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
                {Object.entries(TIER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Tags (comma separated)">
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </Field>
            <div className="flex flex-col justify-end gap-2 text-[13px] text-ink-2">
              {([
                ["site_fulltext", "Full text on the site"],
                ["syndicate_fulltext", "Full text in public outputs"],
              ] as const).map(([k, label]) => (
                <label key={k} className="inline-flex items-center gap-2">
                  <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="mt-4">
            <Field label="Collection config (JSON)">
              <Textarea className="font-mono !text-[12px]" rows={10} value={config} onChange={(e) => setConfig(e.target.value)} spellCheck={false} />
            </Field>
            {error && <div className="mt-1 text-[12.5px] text-hot">{error}</div>}
          </div>
          {duplicate && (
            <div className="mt-4 rounded-card bg-amber/10 px-4 py-3 text-[13px] text-ink-2 ring-1 ring-amber/25">
              This address is already watched: <Link className="font-medium text-accent" to={`/admin/sources/${encodeURIComponent(duplicate.id)}`}>{duplicate.name}</Link>({duplicate.id}). Nothing was created.
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button
              busy={pending === "preview"}
              onClick={async () => {
                const c = parsed();
                if (!c) return;
                const r = await run<AdminSourcePreview>("POST", "/api/admin/sources/preview", { id: form.id || "draft", kind: form.kind, config: c }, { label: "preview", revalidate: false });
                if (r) setPreview(r);
              }}
            >
              Preview fetch
            </Button>
            <Button
              tone="primary"
              busy={pending === "create"}
              disabled={!form.id || !form.name}
              onClick={async () => {
                const c = parsed();
                if (!c) return;
                const r = await run<AdminSourceCreated>(
                  "POST",
                  "/api/admin/sources",
                  { ...form, tags: form.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean), config: c },
                  { label: "create", revalidate: false },
                );
                if (!r) return;
                if (r.created) navigate(`/admin/sources/${encodeURIComponent(r.source.id)}`);
                else setDuplicate(r.duplicate);
              }}
            >
              Create
            </Button>
          </div>
        </Card>
        <Card title={preview ? `Preview: ${preview.count} items (${preview.ms} ms)` : "Preview"}>
          {!preview ? (
            <Empty>Fill in the config and press “Preview fetch” to see the items it would collect (nothing is stored).</Empty>
          ) : preview.items.length ? (
            <ul className="space-y-3">
              {preview.items.map((i) => (
                <li key={i.url} className="text-[13px]">
                  <a href={i.url} target="_blank" rel="noreferrer" className="font-medium text-ink hover:text-accent">{i.title}</a>
                  <div className="text-[12px] text-ink-4">{i.publishedAt ? wallTime(i.publishedAt, true) : "no publication time"}</div>
                  {i.excerpt && <div className="mt-0.5 line-clamp-2 text-[12.5px] text-ink-3">{i.excerpt}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No items found.</Empty>
          )}
        </Card>
      </div>
    </AdminPage>
  );
}
