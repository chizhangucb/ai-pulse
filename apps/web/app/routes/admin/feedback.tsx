import { ADMIN, SITE } from "@aihot/site";
import { useState } from "react";
import { Form, useSearchParams } from "react-router";
import type { Route } from "./+types/feedback";
import type { AdminFeedback, AdminFeedbackRow } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { wallTime } from "../../features/admin/format";
import { FEEDBACK_STATUS } from "../../features/admin/labels";
import { AdminPage, Badge, Button, Card, Empty, FilterChips, Input, Pager, ReasonDialog, Select, Textarea, Time } from "../../features/admin/ui";



export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<AdminFeedback>(request, `/api/admin/feedback${new URL(request.url).search}`);
}

export const meta: Route.MetaFunction = () => [{ title: `Feedback · ${SITE.name} admin` }];

const TONE: Record<string, "accent" | "warn" | "ok" | "muted"> = { new: "accent", triaged: "warn", replied: "ok", resolved: "ok", spam: "muted" };

function FeedbackCard({ f }: { f: AdminFeedbackRow }) {
  const { run, pending } = useAdminAction();
  const [note, setNote] = useState(f.note ?? "");
  const [dialog, setDialog] = useState<null | "ban" | "email-ban" | "erase">(null);
  const base = `/api/admin/feedback/${f.id}`;
  const version = new Date(f.updated_at).toISOString();
  return (
    <article className="rounded-panel bg-surface p-4 ring-1 ring-line">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
        <span className="num font-medium text-ink-2">#{f.id}</span>
        <Badge tone={TONE[f.status] ?? "muted"}>{FEEDBACK_STATUS[f.status] ?? f.status}</Badge>
        <Time at={f.created_at} />
        {f.email && <a className="text-accent" href={`mailto:${f.email}`}>{f.email}</a>}
        {f.page_url && <a className="max-w-[320px] truncate hover:text-accent" href={f.page_url} target="_blank" rel="noreferrer">{f.page_url}</a>}
        {f.from_source > 1 && <Badge tone="info" title="Same sender (a one-way mark of IP and browser family)">{f.from_source} from this sender</Badge>}
        {f.banned && <Badge tone="bad">Sender banned</Badge>}
        {f.email_banned && <Badge tone="bad">Email banned for now</Badge>}
        {!f.forwarded_at && f.status === "new" && (
          <Badge tone="warn" title={f.forward_error && f.forward_error !== "pending" ? `Not forwarded to the internal Feishu group yet: ${f.forward_error}` : "Not forwarded to the internal Feishu group yet"}>Not forwarded</Badge>
        )}
      </div>
      <p className="mt-2.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{f.content}</p>
      {f.screenshot === "local" && (
        <a href={`${base}/screenshot`} target="_blank" rel="noreferrer" className="mt-2 inline-block">
          <img src={`${base}/screenshot`} alt="Feedback screenshot" loading="lazy" className="max-h-48 rounded-control ring-1 ring-line" />
        </a>
      )}
      {f.screenshot === "feishu" && <p className="mt-2 text-[12.5px] text-ink-4">The screenshot went to the internal Feishu group with the feedback.</p>}
      {f.screenshot === "gone" && <p className="mt-2 text-[12.5px] text-ink-4">The screenshot could not be sent to Feishu and was deleted.</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr_auto] sm:items-start">
        <Select
          aria-label="Status"
          value={f.status}
          disabled={!!pending}
          onChange={(e) => run("PATCH", base, { status: e.target.value, version }, { label: "status", success: "Status updated" })}
        >
          {Object.entries(FEEDBACK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Textarea rows={1} className="!min-h-[38px]" placeholder="Note (internal only)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          <Button size="md" disabled={note === (f.note ?? "")} busy={pending === "note"} onClick={() => run("PATCH", base, { note: note || null, version }, { label: "note", success: "Note saved" })}>
            Save note
          </Button>
          <Button tone="ghost" onClick={() => setDialog(f.banned ? null : "ban")} disabled={f.banned} title="Refuse further feedback from this sender">Ban sender</Button>
          {f.email && <Button tone="ghost" onClick={() => setDialog("email-ban")} disabled={f.email_banned} title="Refuse feedback giving this email, lifted after 48 hours">Ban email for now</Button>}
          <Button tone="ghost" onClick={() => setDialog("erase")} title="Delete the sender's data as the privacy notice describes">Delete data</Button>
        </div>
      </div>
      <ReasonDialog
        open={dialog === "ban"}
        title="Ban this feedback sender"
        description={`Later feedback from the same sender is refused. The sender mark cannot be turned back into an IP.${ADMIN.banNote ? ` ${ADMIN.banNote}` : ""}`}
        danger
        confirmLabel="Ban"
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => (await run("POST", "/api/admin/feedback-bans", { sourceHash: f.source_hash, reason }, { label: "ban", success: "Banned" })) !== null}
      />
      <ReasonDialog
        open={dialog === "email-ban"}
        title="Ban this feedback email for now"
        description="Feedback giving this email is refused for 48 hours, from any network or browser. Emails are not verified, so use this only for confirmed, repeated abuse; it bans no other email and does not block reading the site."
        danger
        confirmLabel="Ban for 48 hours"
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => (await run("POST", "/api/admin/feedback-bans", { feedbackId: f.id, reason }, { label: "email-ban", success: "Email banned for 48 hours" })) !== null}
      />
      <ReasonDialog
        open={dialog === "erase"}
        title="Delete the sender's data"
        description="Deletes the text, email, page address and screenshot and keeps only the handling record. This cannot be undone."
        danger
        confirmLabel="Delete"
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => (await run("POST", `${base}/erase`, { reason }, { label: "erase", success: "Data deleted" })) !== null}
      />
    </article>
  );
}

export default function FeedbackAdmin({ loaderData }: Route.ComponentProps) {
  const { rows, counts, bans, page } = loaderData;
  const [sp] = useSearchParams();
  const { run } = useAdminAction();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <AdminPage title="Feedback" subtitle={ADMIN.feedbackNote}>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips
          param="status"
          options={[{ value: "", label: "All", count: total }, ...Object.entries(FEEDBACK_STATUS).map(([k, v]) => ({ value: k, label: v, count: counts[k] ?? 0 }))]}
        />
        <Form method="get" className="w-full max-w-xs">
          {sp.get("status") && <input type="hidden" name="status" value={sp.get("status")!} />}
          <Input name="q" defaultValue={sp.get("q") ?? ""} placeholder="Search text, email, page" aria-label="Search feedback" />
        </Form>
      </div>
      <div className="space-y-3">
        {rows.length ? rows.map((f) => <FeedbackCard key={`${f.id}-${f.updated_at}`} f={f} />) : <Card><Empty>No matching feedback</Empty></Card>}
      </div>
      <Pager page={page} hasMore={rows.length === 50} />
      {bans.length > 0 && (
        <Card className="mt-8" title="Feedback bans">
          <ul className="space-y-2 text-[13px]">
            {bans.map((b) => (
              <li key={b.source_hash} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {b.source_hash.startsWith("email:") ? "Email" : "Sender"} · <span className="break-all font-mono text-[12px] text-ink-3">{b.source_hash}</span> · {b.reason} · {b.created_by} · {wallTime(b.created_at, true)}
                  {b.expires_at && <span> · lifted {wallTime(b.expires_at, true)}</span>}
                </span>
                <Button size="sm" tone="ghost" onClick={() => run("DELETE", `/api/admin/feedback-bans/${encodeURIComponent(b.source_hash)}`, undefined, { label: `unban-${b.source_hash}`, success: "Ban lifted" })}>
                  Lift
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </AdminPage>
  );
}
