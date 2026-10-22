import { SITE } from "@aihot/site";
import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/source";
import { REPLACEABLE_SOURCE_KINDS, type AdminSource, type AdminSourceDetail, type AdminSourcePreview, type AdminSourceUpdate } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { wallTime, duration, num } from "../../features/admin/format";
import { HEALTH_LABEL, KIND_LABEL, MODE_LABEL, TIER_LABEL, VISIBILITY_LABEL } from "../../features/admin/labels";
import { AdminPage, Badge, Button, Card, DataTable, Dot, Empty, Field, healthTone, Input, Json, KV, ReasonDialog, Select, Stat, Textarea, Time } from "../../features/admin/ui";


/** X runs: pages read, and older stretches still to read (backlog) or given up (dropped). */



export async function loader({ request, params }: Route.LoaderArgs) {
  return adminGet<AdminSourceDetail>(request, `/api/admin/sources/${encodeURIComponent(params.id)}`);
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `${loaderData?.source.name ?? "Source"} · ${SITE.name} admin` }];

type Draft = Pick<AdminSource, "name" | "kind" | "interval_minutes" | "tier" | "participation_mode" | "signal_group_id" | "first_party" | "owner_entity_id" | "site_fulltext" | "syndicate_fulltext"> & { tags: string; config: string };

function draftOf(s: AdminSource): Draft {
  return {
    name: s.name,
    kind: s.kind,
    interval_minutes: s.interval_minutes,
    tier: s.tier,
    participation_mode: s.participation_mode,
    signal_group_id: s.signal_group_id,
    first_party: s.first_party,
    owner_entity_id: s.owner_entity_id,
    site_fulltext: s.site_fulltext,
    syndicate_fulltext: s.syndicate_fulltext,
    tags: s.tags.join(", "),
    config: JSON.stringify(s.config, null, 2),
  };
}

export default function SourceDetail({ loaderData }: Route.ComponentProps) {
  const { source: s, runs, items, stats, history } = loaderData;
  const { run, pending } = useAdminAction();
  const [draft, setDraft] = useState<Draft>(() => draftOf(s));
  const [draftFor, setDraftFor] = useState(s.updated_at);
  const [preview, setPreview] = useState<AdminSourcePreview | null>(null);
  const [dialog, setDialog] = useState<null | "save" | "toggle">(null);
  const [configError, setConfigError] = useState<string | null>(null);
  if (draftFor !== s.updated_at) {
    // The source changed (our own save or someone else's): start from the saved state.
    setDraft(draftOf(s));
    setDraftFor(s.updated_at);
  }
  const base = `/api/admin/sources/${encodeURIComponent(s.id)}`;

  const patch = (): AdminSourceUpdate["patch"] | null => {
    let config: unknown;
    try {
      config = JSON.parse(draft.config);
      setConfigError(null);
    } catch (e) {
      setConfigError(`The config is not valid JSON: ${(e as Error).message}`);
      return null;
    }
    const next: Record<string, unknown> = {
      ...draft,
      tags: draft.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
      config,
      interval_minutes: Number(draft.interval_minutes),
      signal_group_id: draft.signal_group_id || null,
      owner_entity_id: draft.owner_entity_id || null,
    };
    const before = draftOf(s) as Record<string, unknown>;
    const changed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(next)) {
      const was = k === "tags" ? s.tags : k === "config" ? s.config : before[k];
      if (JSON.stringify(v) !== JSON.stringify(was)) changed[k] = v;
    }
    if (draft.kind !== s.kind) changed.config = config;
    return changed as AdminSourceUpdate["patch"];
  };
  const changes = (() => {
    try {
      return Object.keys(patchPreview(draft, s)).length;
    } catch {
      return 1;
    }
  })();

  return (
    <AdminPage
      title={
        <span className="flex flex-wrap items-center gap-2">
          {s.name}
          <Badge>{KIND_LABEL[s.kind] ?? s.kind}</Badge>
          <Badge tone={s.participation_mode === "editorial" ? "accent" : "muted"}>{MODE_LABEL[s.participation_mode]}</Badge>
        </span>
      }
      subtitle={<span className="font-mono text-[12px]">{s.id}</span>}
      actions={
        <>
          <Button
            busy={pending === "preview"}
            onClick={async () => {
              const p = patch();
              if (!p) return;
              const r = changes && (REPLACEABLE_SOURCE_KINDS as readonly string[]).includes(draft.kind)
                ? await run<AdminSourcePreview>("POST", "/api/admin/sources/preview", { id: s.id, kind: draft.kind, config: p.config ?? s.config, participation_mode: draft.participation_mode }, { label: "preview", revalidate: false })
                : await run<AdminSourcePreview>("POST", `${base}/preview`, undefined, { label: "preview", revalidate: false });
              if (r) setPreview(r);
            }}
          >
            Preview this config
          </Button>
          <Button busy={pending === "fetch"} onClick={() => run("POST", `${base}/fetch`, undefined, { label: "fetch", success: "Queued for collection" })}>
            Collect now
          </Button>
          <Button tone={s.enabled ? "danger" : "primary"} onClick={() => setDialog("toggle")}>
            {s.enabled ? "Pause" : "Resume"}
          </Button>
        </>
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Health"
          value={
            <span className="inline-flex items-center gap-2 text-[18px]">
              <Dot tone={s.enabled ? healthTone(s.health) : "muted"} />
              {s.enabled ? HEALTH_LABEL[s.health] ?? s.health : "Paused"}
            </span>
          }
          hint={s.fail_count ? `${s.fail_count} failures in a row` : `last success ${s.last_ok_at ? wallTime(s.last_ok_at) : "—"}`}
        />
        <Stat label="Items in total" value={num(stats.total)} />
        <Stat label="Last 7 days" value={num(stats.last7d)} />
        <Stat label="Picked" value={num(stats.selected)} />
      </div>
      {s.last_error && s.health !== "ok" && <div className="mb-5 rounded-card bg-hot-soft px-4 py-3 text-[13px] text-hot ring-1 ring-hot/20">{s.last_error}</div>}

      {preview && (
        <Card className="mb-5" title={`Preview: ${preview.count} items (${preview.ms} ms, not stored)`} right={<button onClick={() => setPreview(null)}>Close</button>}>
          {preview.items.length ? (
            <ul className="space-y-2.5">
              {preview.items.map((i) => (
                <li key={i.url} className="text-[13px]">
                  <a href={i.url} target="_blank" rel="noreferrer" className="font-medium text-ink hover:text-accent">{i.title}</a>
                  <div className="text-[12px] text-ink-4">{i.publishedAt ? wallTime(i.publishedAt, true) : "no publication time"} · {i.url}</div>
                  {i.excerpt && <div className="mt-0.5 line-clamp-2 text-[12.5px] text-ink-3">{i.excerpt}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No items found. Check the address, the selectors or whether the page needs a login.</Empty>
          )}
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card title="Settings" right={<span>Version {wallTime(s.updated_at, true)}</span>}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </Field>
              {(REPLACEABLE_SOURCE_KINDS as readonly string[]).includes(s.kind) && (
                <Field label="Kind" hint="The source and its history stay; fill in the full config for the new kind and preview it">
                  <Select value={draft.kind} onChange={(e) => { setDraft({ ...draft, kind: e.target.value }); setPreview(null); }}>
                    {REPLACEABLE_SOURCE_KINDS.map(kind => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}
                  </Select>
                </Field>
              )}
              <Field label="Interval (minutes)">
                <Input type="number" min={1} max={1440} value={draft.interval_minutes} onChange={(e) => setDraft({ ...draft, interval_minutes: Number(e.target.value) })} />
              </Field>
              <Field label="Participation" hint="Heat only counts as discussion evidence for trending, never content of its own">
                <Select value={draft.participation_mode} onChange={(e) => setDraft({ ...draft, participation_mode: e.target.value })}>
                  {Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Tier" hint="Only T1 is first party">
                <Select value={draft.tier} onChange={(e) => setDraft({ ...draft, tier: e.target.value })}>
                  {Object.entries(TIER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Discussion group ID" hint="Shared by one organization's accounts, so their heat counts once">
                <Input value={draft.signal_group_id ?? ""} onChange={(e) => setDraft({ ...draft, signal_group_id: e.target.value })} />
              </Field>
              <Field label="Owner entity ID">
                <Input value={draft.owner_entity_id ?? ""} onChange={(e) => setDraft({ ...draft, owner_entity_id: e.target.value })} />
              </Field>
              <Field label="Tags (comma separated)">
                <Input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />
              </Field>
              <div className="flex flex-col justify-end gap-2 text-[13px] text-ink-2">
                {([
                  ["site_fulltext", "Full text on the site"],
                  ["syndicate_fulltext", "Full text in public outputs"],
                ] as const).map(([k, label]) => (
                  <label key={k} className="inline-flex items-center gap-2">
                    <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.checked })} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <Field label="Collection config (JSON)">
                <Textarea className="font-mono !text-[12px]" rows={Math.min(18, draft.config.split("\n").length + 1)} value={draft.config} onChange={(e) => setDraft({ ...draft, config: e.target.value })} spellCheck={false} />
              </Field>
              {configError && <div className="mt-1 text-[12.5px] text-hot">{configError}</div>}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              {changes > 0 && <span className="text-[12.5px] text-ink-3">{changes} unsaved changes</span>}
              <Button tone="ghost" disabled={!changes} onClick={() => setDraft(draftOf(s))}>Revert</Button>
              <Button tone="primary" disabled={!changes} onClick={() => patch() && setDialog("save")}>Save</Button>
            </div>
          </Card>

          <Card title="Latest items" pad={false}>
            <DataTable
              rows={items}
              rowKey={(r) => r.id}
              empty="Nothing collected yet"
              columns={[
                {
                  key: "t",
                  label: "Title",
                  render: (r) => (
                    <Link to={`/admin/content/${r.id}`} className="line-clamp-2 min-w-[260px] text-ink hover:text-accent">{r.title_zh || r.title}</Link>
                  ),
                },
                { key: "s", label: "Status", render: (r) => <span className="flex gap-1">{r.selected && <Badge tone="accent">Pick</Badge>}{r.visibility && r.visibility !== "public" && <Badge tone="warn">{VISIBILITY_LABEL[r.visibility]}</Badge>}<Badge>{r.processing_state}</Badge></span> },
                { key: "d", label: "Found", render: (r) => <Time at={r.discovered_at} /> },
              ]}
            />
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Status">
            <KV
              items={[
                ["Last fetch", s.last_fetch_at ? wallTime(s.last_fetch_at, true) : null],
                ["Last success", s.last_ok_at ? wallTime(s.last_ok_at, true) : null],
                ["Next fetch", s.next_fetch_at ? wallTime(s.next_fetch_at, true) : null],
                ["Created", wallTime(s.created_at, true)],
              ]}
            />
            {s.cursor && <div className="mt-3"><Json value={s.cursor} label="Cursor" /></div>}
          </Card>
          <Card title="Collection runs" pad={false}>
            <DataTable
              dense
              rows={runs}
              rowKey={(r) => r.id}
              empty="No collection runs yet"
              columns={[
                { key: "at", label: "Time", render: (r) => <span className="num whitespace-nowrap">{wallTime(r.started_at)}</span> },
                {
                  key: "st",
                  label: "Result",
                  render: (r) => (
                    <span className="inline-flex gap-1">
                      <Badge tone={r.status === "ok" ? "ok" : r.status === "failed" ? "bad" : "muted"} title={r.error ?? undefined}>{r.status}</Badge>
                      {!!r.detail?.presentationFailures?.length && <Badge tone="warn" title={r.detail.presentationFailures.map(f => `${f.url}: ${f.error}`).join("\n")}>Body display pending {r.detail.presentationFailures.length}</Badge>}
                      {!!r.detail?.dropped && <Badge tone="bad" title="An earlier stretch of posts could not be read to the end; some may be missing">May have missed posts</Badge>}
                      {!r.detail?.dropped && !!r.detail?.backlog && <Badge tone="warn" title="More posts than one run reads; the rest are read in the next runs">{r.detail.backlog} stretches left</Badge>}
                    </span>
                  ),
                },
                { key: "n", label: "Found/new", align: "right", render: (r) => `${r.found_count ?? "—"}/${r.new_count ?? "—"}` },
                { key: "ms", label: "Duration", align: "right", render: (r) => duration(r.started_at, r.finished_at) },
              ]}
            />
          </Card>
          <Card title="Changes">
            {history.length ? (
              <ul className="space-y-3 text-[12.5px]">
                {history.map((h, i) => (
                  <li key={i}>
                    <div className="text-ink-2"><span className="font-medium">{h.action}</span> · {h.actor} · {wallTime(h.created_at)}</div>
                    {h.reason && <div className="text-ink-3">{h.reason}</div>}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No manual changes</Empty>
            )}
          </Card>
        </div>
      </div>

      <ReasonDialog
        open={dialog === "save"}
        title="Save source settings"
        description={`${draft.kind !== s.kind ? `Kind changes from ${KIND_LABEL[s.kind]} to ${KIND_LABEL[draft.kind]}; history stays. ` : ""}Changes: ${Object.keys(patchPreview(draft, s)).join(", ") || "none"}`}
        busy={pending === "save"}
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => {
          const p = patch();
          if (!p) return false;
          const body: AdminSourceUpdate = { patch: p, version: new Date(s.updated_at).toISOString(), reason };
          const r = await run("PATCH", base, body, { label: "save", success: "Saved" });
          return r !== null;
        }}
      />
      <ReasonDialog
        open={dialog === "toggle"}
        title={s.enabled ? "Pause this source" : "Resume this source"}
        description={s.enabled ? "Collection stops; existing content and history stay." : "A collection is queued right away."}
        danger={s.enabled}
        confirmLabel={s.enabled ? "Pause" : "Resume"}
        busy={pending === "toggle"}
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => {
          const r = await run("PATCH", base, { patch: { enabled: !s.enabled }, version: new Date(s.updated_at).toISOString(), reason }, { label: "toggle", success: s.enabled ? "Paused" : "Resumed" });
          return r !== null;
        }}
      />
    </AdminPage>
  );
}

/** Field names that differ from the saved source (for the confirmation text). */
function patchPreview(draft: Draft, s: AdminSource): Record<string, true> {
  const out: Record<string, true> = {};
  const saved = draftOf(s);
  for (const k of Object.keys(draft) as Array<keyof Draft>) {
    if (k === "config") {
      try {
        if (JSON.stringify(JSON.parse(draft.config)) !== JSON.stringify(s.config)) out.config = true;
      } catch {
        out.config = true;
      }
    } else if (String(draft[k] ?? "") !== String(saved[k] ?? "")) out[k] = true;
  }
  return out;
}
