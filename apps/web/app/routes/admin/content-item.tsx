import { SITE } from "@aihot/site";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { CATEGORY_KEYS, CATEGORY_LABELS } from "@aihot/contracts/taxonomy";
import type { Route } from "./+types/content-item";
import type { AdminContentChain, AdminPresentationRefresh } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { wallTime, money } from "../../features/admin/format";
import { KIND_LABEL, MODE_LABEL, VISIBILITY_LABEL } from "../../features/admin/labels";
import { AdminPage, Badge, Button, Card, Empty, Field, Input, Json, KV, ReasonDialog, Select, Textarea } from "../../features/admin/ui";


export async function loader({ request, params }: Route.LoaderArgs) {
  return adminGet<AdminContentChain>(request, `/api/admin/content/${encodeURIComponent(params.id)}`);
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `${loaderData?.publication?.title ?? loaderData?.article.title ?? "Item"} · ${SITE.name} admin` }];

function Step({ title, meta, children, tone = "accent", last }: { title: ReactNode; meta?: ReactNode; children: ReactNode; tone?: "accent" | "muted" | "bad"; last?: boolean }) {
  const dot = tone === "bad" ? "bg-hot" : tone === "muted" ? "bg-ink-4" : "bg-accent";
  return (
    <li className="relative pl-7">
      {!last && <span className="absolute left-[7px] top-4 h-full w-px bg-line-strong" aria-hidden />}
      <span className={`absolute left-[3px] top-[7px] size-[9px] rounded-full ring-4 ring-bg ${dot}`} aria-hidden />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-[13.5px] font-semibold text-ink">{title}</h3>
        {meta && <div className="text-[12px] text-ink-4">{meta}</div>}
      </div>
      <div className="mt-2 pb-6 text-[13px] text-ink-2">{children}</div>
    </li>
  );
}

type Dialog = null | "visibility" | "seo" | "override" | "analyze" | "extract" | "presentation" | "group" | "detach" | "merge";

export default function ContentItem({ loaderData }: Route.ComponentProps) {
  const c = loaderData;
  const a = c.article;
  const p = c.publication;
  const { run, pending } = useAdminAction();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [presentation, setPresentation] = useState<AdminPresentationRefresh | null>(null);
  const [visibility, setVisibility] = useState<string>(p?.visibility ?? "public");
  const [fields, setFields] = useState({ title: "", summary: "", reason: "", category: "", tags: "", scoreMode: "", score: "", selected: "", silent: "" });
  const [mergeInto, setMergeInto] = useState("");
  const version = c.override?.version ?? 0;
  const base = `/api/admin/content/${encodeURIComponent(a.id)}`;
  const story = c.membership[0];
  const title = p?.title ?? a.title;

  const openOverride = () => {
    const f = (c.override?.fields ?? {}) as Record<string, unknown>;
    setFields({
      title: String(f.title ?? ""),
      summary: String(f.summary ?? ""),
      reason: String(f.reason ?? ""),
      category: String(f.category ?? ""),
      tags: Array.isArray(f.tags) ? (f.tags as string[]).join(", ") : "",
      scoreMode: f.score === null ? "none" : typeof f.score === "number" ? "value" : "",
      score: typeof f.score === "number" ? String(f.score) : "",
      selected: f.selected === undefined ? "" : String(f.selected),
      silent: f.silent === undefined ? "" : String(f.silent),
    });
    setDialog("override");
  };

  return (
    <AdminPage
      title={<span className="line-clamp-2">{title}</span>}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[12px]">{a.id}</span>
          <span>·</span>
          <Link className="hover:text-accent" to={`/admin/sources/${encodeURIComponent(a.source_id)}`}>{a.source_name}</Link>
          <span>·</span>
          <a className="max-w-[420px] truncate hover:text-accent" href={a.url} target="_blank" rel="noreferrer">{a.url}</a>
          {p?.visibility !== "withdrawn" && p && (
            <>
              <span>·</span>
              <a className="text-accent" href={`/items/${a.id}`} target="_blank" rel="noreferrer">Public page</a>
            </>
          )}
        </span>
      }
      actions={
        <>
          <Button onClick={() => setDialog("visibility")}>Visibility</Button>
          {p && <Button onClick={() => setDialog("seo")}>{p.indexable ? "Stop indexing" : "Mark indexable"}</Button>}
          <Button onClick={openOverride}>Correct by hand</Button>
          <Button onClick={() => { setPresentation(null); setDialog("presentation"); }}>Refresh body display</Button>
          <Button onClick={() => setDialog("analyze")}>Re-evaluate</Button>
        </>
      }
    >
      <div className="mb-5 flex flex-wrap gap-1.5">
        {p ? <Badge tone={p.visibility === "public" ? "ok" : "warn"}>{VISIBILITY_LABEL[p.visibility] ?? p.visibility}</Badge> : <Badge>Not public</Badge>}
        {p?.selected && <Badge tone="accent">Pick</Badge>}
        {p?.eligible === false && <Badge>Not eligible for public pages</Badge>}
        {a.backfill && <Badge tone="warn">Backfill</Badge>}
        <Badge>Processing {a.processing_state}</Badge>
        {c.override && <Badge tone="info" title={c.override.reason ?? undefined}>Manual override v{c.override.version}</Badge>}
      </div>
      {a.processing_error && <div className="mb-5 rounded-card bg-hot-soft px-4 py-3 text-[13px] text-hot ring-1 ring-hot/20">{a.processing_error}</div>}

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card title="Pipeline">
          <ol className="pt-1">
            <Step title="Source" meta={`${KIND_LABEL[a.source_kind] ?? a.source_kind} · ${String(a.tier).replace("_", ".")} · ${MODE_LABEL[a.participation_mode] ?? a.participation_mode}`}>
              <Link className="text-ink hover:text-accent" to={`/admin/sources/${encodeURIComponent(a.source_id)}`}>{a.source_name}</Link>
              <span className="text-ink-4"> · full text on site {a.site_fulltext ? "allowed" : "not allowed"} · in public outputs {a.syndicate_fulltext ? "allowed" : "not allowed"}</span>
            </Step>
            <Step title="Found" meta={`${c.discoveries.length} times`}>
              <ul className="space-y-1">
                {c.discoveries.map((d, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="num text-ink-4">{wallTime(d.discovered_at, true)}</span>
                    <span>{d.via}</span>
                    {d.source_id !== a.source_id && <span className="text-ink-3">via {d.source_id}</span>}
                  </li>
                ))}
              </ul>
              <div className="mt-1.5 text-[12px] text-ink-4">
                Published {a.published_at ? wallTime(a.published_at, true) : "unknown"}{a.published_at_claim && !a.published_at ? ` (claimed ${a.published_at_claim}, not accepted)` : ""} · timeline {wallTime(a.timeline_at, true)}
              </div>
            </Step>
            <Step title="Body and revisions" meta={`revision ${a.revision} · body ${a.body_status} · ${a.body_chars ?? 0} characters`}>
              {c.revisions.length ? (
                <ul className="space-y-1">
                  {c.revisions.map((r) => (
                    <li key={r.revision} className="flex gap-2">
                      <span className="num text-ink-4">v{r.revision}</span>
                      <span className="min-w-0 flex-1 truncate">{r.title}</span>
                      <span className="num shrink-0 text-ink-4">{wallTime(r.created_at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-ink-4">Only the first revision</span>
              )}
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => setDialog("extract")}>Extract body again</Button>
              </div>
            </Step>
            <Step title="Model judgment" meta={`${c.analyses.length} times`} tone={c.analyses.length ? "accent" : "muted"}>
              {c.analyses.length ? (
                <div className="space-y-3">
                  {c.analyses.map((an) => (
                    <div key={an.id} className="rounded-control bg-bg-sunk/60 p-3 ring-1 ring-line">
                      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                        <Badge tone={an.relevance === "pass" ? "ok" : "muted"}>{an.relevance}</Badge>
                        {an.selected && <Badge tone="accent">Picked</Badge>}
                        <Badge tone="info">Score {an.score}</Badge>
                        {an.category && <Badge>{CATEGORY_LABELS[an.category as keyof typeof CATEGORY_LABELS] ?? an.category}</Badge>}
                        <span className="text-ink-4">{an.model} · {an.prompt_version} · input v{an.input_revision} · {an.origin} · {wallTime(an.created_at)}</span>
                      </div>
                      {an.title_zh && <div className="mt-2 font-medium text-ink">{an.title_zh}</div>}
                      {an.reason_zh && <div className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{an.reason_zh}</div>}
                      {an.receipts.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11.5px]">
                          {an.receipts.map((r) => (
                            <span key={r.id} className="num rounded-mark bg-surface px-1.5 py-0.5 text-ink-3 ring-1 ring-line">
                              Receipt #{r.id} · {r.status} · {r.model ?? r.service}{r.cost !== null ? ` · ${money(r.cost, r.currency)}` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-ink-4">{a.participation_mode === "editorial" ? "Not judged yet (queued or failed)" : "Heat-only sources get no editorial judgment"}</span>
              )}
            </Step>
            <Step title="Public" tone={p ? (p.visibility === "withdrawn" ? "bad" : "accent") : "muted"} meta={p ? `updated ${wallTime(p.updated_at, true)}` : undefined}>
              {p ? (
                <KV
                  items={[
                    ["Visibility", VISIBILITY_LABEL[p.visibility] ?? p.visibility],
                    ["Pick", p.selected ? `yes · visible ${p.visible_after ? wallTime(p.visible_after, true) : "now"}` : "no"],
                    ["Category", p.category ? CATEGORY_LABELS[p.category as keyof typeof CATEGORY_LABELS] ?? p.category : null],
                    ["Tags", (p.tags as string[] | null)?.join(", ")],
                    ["Summary", p.summary],
                    ["Why it matters", p.reason],
                    [
                      "Body display",
                      `${p.body_mode}${p.syndicate ? " · full text in public outputs" : ""}${
                        p.indexable ? (p.seo_indexed_at ? " · indexable (marked by hand)" : " · indexable (pick)") : p.seo_excluded_at ? " · not indexed (excluded by hand)" : " · not indexed"
                      }`,
                    ],
                  ]}
                />
              ) : (
                <span className="text-ink-4">No public projection (failed relevance or still processing)</span>
              )}
              {c.override && (
                <div className="mt-3 rounded-control bg-accent-softer p-3 ring-1 ring-accent/15">
                  <div className="text-[12px] text-ink-3">Manual override v{c.override.version} · {c.override.updated_by} · {wallTime(c.override.updated_at, true)}{c.override.reason ? ` · ${c.override.reason}` : ""}</div>
                  <Json value={{ visibility: c.override.visibility, ...c.override.fields }} label="Overridden fields" collapsed={false} />
                </div>
              )}
            </Step>
            <Step title="Picks sync ledger" meta={`${c.ledger.length} entries`} tone={c.ledger.length ? "accent" : "muted"}>
              {c.ledger.length ? (
                <ul className="space-y-1">
                  {c.ledger.map((l) => (
                    <li key={l.seq} className="flex gap-2">
                      <span className="num text-ink-4">#{l.seq}</span>
                      <Badge tone={l.op === "remove" ? "warn" : "ok"}>{l.op}</Badge>
                      <span className="num text-ink-4">visible {wallTime(l.visible_at)} · written {wallTime(l.changed_at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-ink-4">Never entered the picks sync stream</span>
              )}
            </Step>
            <Step title="Story grouping" tone={story ? "accent" : "muted"} meta={a.grouped_at ? `grouped ${wallTime(a.grouped_at, true)}` : "not grouped"}>
              {c.membership.map((m) => (
                <div key={m.fact_id} className="mb-2">
                  <div>
                    Fact <span className="font-mono text-[12px]">#{m.fact_id}</span> {m.fact_title} <Badge>{m.role}</Badge> {m.manual && <Badge tone="info">manual</Badge>}
                  </div>
                  {m.story_public_id && (
                    <div className="mt-0.5">
                      Story <a className="text-accent" href={`/story/${m.story_public_id}`} target="_blank" rel="noreferrer">{m.story_title}</a> <span className="font-mono text-[12px] text-ink-4">#{m.story_id}</span>
                    </div>
                  )}
                </div>
              ))}
              {c.decisions.length > 0 && (
                <ul className="mt-2 space-y-1 text-[12.5px]">
                  {c.decisions.map((d, i) => (
                    <li key={i} className="flex flex-wrap gap-2">
                      <span className="num text-ink-4">{wallTime(d.created_at)}</span>
                      <Badge>{d.verdict}</Badge>
                      {d.fact_id && <span>Fact #{d.fact_id}</span>}
                      {d.receipt_id && <span className="text-ink-4">Receipt #{d.receipt_id}</span>}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setDialog("group")}>Group again</Button>
                {c.membership.length > 0 && <Button size="sm" onClick={() => setDialog("detach")}>Detach from story</Button>}
                {story?.story_id && <Button size="sm" onClick={() => setDialog("merge")}>Merge this story into…</Button>}
              </div>
            </Step>
            <Step title="Deliveries" last meta={`${c.deliveries.length} entries`} tone={c.deliveries.some((d) => d.status === "unknown") ? "bad" : c.deliveries.length ? "accent" : "muted"}>
              {c.deliveries.length ? (
                <ul className="space-y-1">
                  {c.deliveries.map((d, i) => (
                    <li key={i} className="flex flex-wrap gap-2">
                      <span>{d.target_key}</span>
                      <Badge tone={d.status === "sent" ? "ok" : d.status === "unknown" ? "bad" : "muted"}>{d.status}</Badge>
                      <span className="num text-ink-4">{wallTime(d.created_at)}{d.sent_at ? ` → ${wallTime(d.sent_at)}` : ""}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-ink-4">No pushes</span>
              )}
            </Step>
          </ol>
        </Card>

        <div className="space-y-5">
          <Card title="Original data">
            <KV
              items={[
                ["Original title", a.title],
                ["Author", a.author],
                ["Language", a.language],
                ["Identity key", <span className="break-all font-mono text-[11.5px]">{a.identity_key}</span>],
              ]}
            />
          </Card>
          <Card title="Changes">
            {c.history.length ? (
              <ul className="space-y-3 text-[12.5px]">
                {c.history.map((h, i) => (
                  <li key={i}>
                    <div className="text-ink-2"><span className="font-medium">{h.action}</span> · {h.actor} · {wallTime(h.created_at)}</div>
                    {h.reason && <div className="text-ink-3">{h.reason}</div>}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No manual actions</Empty>
            )}
          </Card>
        </div>
      </div>

      <ReasonDialog
        open={dialog === "seo"}
        title={p?.indexable ? "Stop search indexing" : "Mark as indexable"}
        description={
          p?.indexable
            ? "The detail page goes back to noindex and leaves the sitemap; even as a pick it is not indexed until marked again."
            : "Detail pages are noindex unless picked. Marked (while public), it becomes index, joins the sitemap and goes out in the next IndexNow submission. Use it for items of their own value with a full summary and body."
        }
        confirmLabel={p?.indexable ? "Stop indexing" : "Mark indexable"}
        busy={pending === "seo"}
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => (await run("POST", `${base}/seo`, { indexed: !p?.indexable, reason }, { label: "seo", success: p?.indexable ? "No longer indexed" : "Marked indexable" })) !== null}
      />

      <ReasonDialog
        open={dialog === "visibility"}
        title="Visibility"
        description="Applies at once to pages, API, RSS, MCP, the sync stream and search indexing, and refreshes caches. When a publisher asks for a takedown, verify who they are and what it covers first."
        danger={visibility === "withdrawn"}
        confirmLabel="Apply"
        busy={pending === "visibility"}
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => (await run("POST", `${base}/visibility`, { visibility, reason, version }, { label: "visibility", success: "Visibility updated" })) !== null}
      >
        <div className="grid gap-2 sm:grid-cols-3">
          {([
            ["public", "Public", "Shown normally"],
            ["summary-only", "Summary only", "No body; title and summary stay"],
            ["withdrawn", "Withdrawn", "Removed from every output; links return 404"],
          ] as const).map(([v, label, hint]) => (
            <label key={v} className={`cursor-pointer rounded-card p-3 ring-1 transition-colors ${visibility === v ? "bg-accent-soft ring-accent" : "ring-line-strong hover:bg-bg-sunk"}`}>
              <input type="radio" name="visibility" className="sr-only" checked={visibility === v} onChange={() => setVisibility(v)} />
              <div className="text-[13.5px] font-medium text-ink">{label}</div>
              <div className="mt-0.5 text-[12px] text-ink-3">{hint}</div>
            </label>
          ))}
        </div>
      </ReasonDialog>

      <ReasonDialog
        open={dialog === "override"}
        title="Correct by hand"
        description="Manual values win over model output and survive reprocessing. Leave a field empty to keep it as is (to remove an existing correction, choose “Clear”)."
        confirmLabel="Save correction"
        busy={pending === "override"}
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => {
          const next: Record<string, unknown> = {};
          const clear: string[] = [];
          for (const k of ["title", "summary", "reason"] as const) {
            if (fields[k].trim()) next[k] = fields[k].trim();
            else if (c.override?.fields[k] !== undefined) clear.push(k);
          }
          if (fields.category) next.category = fields.category;
          else if (c.override?.fields.category !== undefined) clear.push("category");
          if (fields.tags.trim()) next.tags = fields.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
          else if (c.override?.fields.tags !== undefined) clear.push("tags");
          if (fields.scoreMode === "none") next.score = null;
          else if (fields.scoreMode === "value") next.score = Number(fields.score);
          else if (c.override?.fields.score !== undefined) clear.push("score");
          for (const k of ["selected", "silent"] as const) {
            if (fields[k] === "true" || fields[k] === "false") next[k] = fields[k] === "true";
            else if (c.override?.fields[k] !== undefined) clear.push(k);
          }
          return (await run("POST", `${base}/override`, { fields: next, clear, reason, version }, { label: "override", success: "Correction saved and republished" })) !== null;
        }}
      >
        <Field label="Title"><Input value={fields.title} placeholder={p?.title ?? ""} onChange={(e) => setFields({ ...fields, title: e.target.value })} /></Field>
        <Field label="Summary"><Textarea rows={3} value={fields.summary} placeholder={p?.summary ?? ""} onChange={(e) => setFields({ ...fields, summary: e.target.value })} /></Field>
        <Field label="Why it matters"><Textarea rows={2} value={fields.reason} placeholder={p?.reason ?? ""} onChange={(e) => setFields({ ...fields, reason: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category">
            <Select value={fields.category} onChange={(e) => setFields({ ...fields, category: e.target.value })}>
              <option value="">Keep</option>
              {CATEGORY_KEYS.map((k) => <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>)}
            </Select>
          </Field>
          <Field label="Tags (comma separated)"><Input value={fields.tags} onChange={(e) => setFields({ ...fields, tags: e.target.value })} /></Field>
          <Field label="Score">
            <Select value={fields.scoreMode} onChange={(e) => setFields({ ...fields, scoreMode: e.target.value })}>
              <option value="">From the model</option>
              <option value="none">Withdraw score</option>
              <option value="value">Manual score</option>
            </Select>
          </Field>
          {fields.scoreMode === "value" && <Field label="Score (0–100)"><Input type="number" min={0} max={100} step="any" required value={fields.score} onChange={(e) => setFields({ ...fields, score: e.target.value })} /></Field>}
          <Field label="Pick">
            <Select value={fields.selected} onChange={(e) => setFields({ ...fields, selected: e.target.value })}>
              <option value="">From the model</option>
              <option value="true">Always pick</option>
              <option value="false">Never pick</option>
            </Select>
          </Field>
          <Field label="Push">
            <Select value={fields.silent} onChange={(e) => setFields({ ...fields, silent: e.target.value })}>
              <option value="">Normal</option>
              <option value="true">Silent (no push even when picked)</option>
              <option value="false">Not silent</option>
            </Select>
          </Field>
        </div>
      </ReasonDialog>

      <ReasonDialog
        open={dialog === "analyze"}
        title="Re-evaluate the current revision"
        description="Starts new model calls (billed, with receipts). Pressing again for the same submission is not billed twice."
        requireReason={false}
        confirmLabel="Re-evaluate"
        busy={pending === "analyze"}
        onClose={() => setDialog(null)}
        onSubmit={async () => (await run("POST", `${base}/rerun`, { step: "analyze" }, { label: "analyze", success: "Queued for evaluation" })) !== null}
      />
      <ReasonDialog
        open={dialog === "presentation"}
        title="Refresh body display"
        description="Checks the original page for changed images, links and layout first. When the text is the same, the summary, translation, pick and story stay."
        requireReason={false}
        confirmLabel={presentation?.ready && presentation.changed ? "Apply display update" : "Preview changes"}
        busy={pending === "presentation"}
        onClose={() => setDialog(null)}
        onSubmit={async () => {
          const apply = presentation?.ready && presentation.changed;
          const result = await run<AdminPresentationRefresh>("POST", `${base}/rerun`,
            { step: "presentation", ...(apply ? { version: presentation.version } : { preview: true }) },
            { label: "presentation", revalidate: !!apply, ...(apply ? { success: "Body display updated" } : {}) });
          if (!result) { setPresentation(null); return false; }
          setPresentation(result);
          return result.applied;
        }}
      >
        {presentation && <div className="space-y-2 text-[13px] text-ink-2">
          <p>Images {presentation.images.before} → {presentation.images.after}, links {presentation.links.before} → {presentation.links.after}.</p>
          <p>{presentation.reason ?? (presentation.changed ? "This display update can be applied." : "The body display needs no update.")}</p>
          {presentation.translation === "reused" && <p>The translation keeps its text and takes the new images and links.</p>}
        </div>}
      </ReasonDialog>
      <ReasonDialog
        open={dialog === "extract"}
        title="Extract body again"
        requireReason={false}
        confirmLabel="Extract again"
        busy={pending === "extract"}
        onClose={() => setDialog(null)}
        onSubmit={async () => (await run("POST", `${base}/rerun`, { step: "extract" }, { label: "extract", success: "Queued for extraction" })) !== null}
      />
      <ReasonDialog
        open={dialog === "group"}
        title="Group again"
        description="Memberships set by hand are not overwritten."
        requireReason={false}
        confirmLabel="Group again"
        busy={pending === "group"}
        onClose={() => setDialog(null)}
        onSubmit={async () => (await run("POST", `${base}/rerun`, { step: "group" }, { label: "group", success: "Queued for grouping" })) !== null}
      />
      <ReasonDialog
        open={dialog === "detach"}
        title="Detach from story"
        description="This item is shown on its own, and the story page updates."
        danger
        confirmLabel="Detach"
        busy={pending === "detach"}
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => (await run("POST", `${base}/detach`, { reason }, { label: "detach", success: "Detached from the story" })) !== null}
      />
      <ReasonDialog
        open={dialog === "merge"}
        title="Merge stories"
        description={`Merge story #${story?.story_id} (${story?.story_title ?? ""}) into another story; its old links redirect to the other one.`}
        danger
        confirmLabel="Merge"
        busy={pending === "merge"}
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => {
          if (!/^\d+$/.test(mergeInto.trim())) return false;
          return (await run("POST", "/api/admin/stories/merge", { from: story!.story_id, into: Number(mergeInto), reason }, { label: "merge", success: "Stories merged" })) !== null;
        }}
      >
        <Field label="Target story number" hint="Shown as #number on the content page of any item in that story">
          <Input inputMode="numeric" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} placeholder="e.g. 1234" />
        </Field>
      </ReasonDialog>
    </AdminPage>
  );
}
