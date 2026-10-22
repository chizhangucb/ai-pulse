import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/models";
import type { AdminModels } from "@aihot/contracts/admin";
import { SITE } from "@aihot/site";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { wallTime, money, num } from "../../features/admin/format";
import { AdminPage, Badge, Button, Card, DataTable, Empty, Field, FilterChips, ReasonDialog, Select } from "../../features/admin/ui";
import { webModules } from "../../site-modules";



export async function loader({ request }: Route.LoaderArgs) {
  const days = new URL(request.url).searchParams.get("days") ?? "7";
  return adminGet<AdminModels>(request, `/api/admin/models?days=${encodeURIComponent(days)}`);
}

export const meta: Route.MetaFunction = () => [{ title: `Models and evals · ${SITE.name} admin` }];

const SOURCE_LABEL = { admin: "set in admin", env: "environment", default: "code default" } as const;

/** A cost the provider did not report and no price covers: a link to the prices when a module keeps them. */
function Unpriced() {
  const prices = webModules().find((m) => m.admin?.prices)?.admin?.prices;
  if (prices) return <Link to={prices} className="whitespace-nowrap text-ink-4 hover:text-accent">no price</Link>;
  return <span className="whitespace-nowrap text-ink-4" title="The provider returned no cost; it is estimated from the tokens and your unit prices">no price</span>;
}
const secs = (ms: number | null) => (ms == null ? "—" : ms >= 10_000 ? `${Math.round(ms / 1000)} s` : `${(ms / 1000).toFixed(1)} s`);

export default function ModelsAdmin({ loaderData: m }: Route.ComponentProps) {
  const { run, pending } = useAdminAction();
  const [target, setTarget] = useState<AdminModels["capabilities"][number] | null>(null);
  const [choice, setChoice] = useState<string>("");
  const labelOf = (key: string) => m.capabilities.find((c) => `capability:${c.key}` === key)?.label ?? key;

  return (
    <AdminPage
      title="Models and evals"
      subtitle="The model each step uses now and where it comes from (admin > environment > code default), with recent success rate, latency and cost. A switch affects only new tasks; existing results are not recomputed. Before changing the picking model, compare on SelectBench."
      actions={<FilterChips param="days" options={[{ value: "1", label: "24 hours" }, { value: "", label: "7 days" }, { value: "30", label: "30 days" }]} />}
    >
      <div className="grid grid-cols-1 gap-5">
        {m.capabilities.map((c) => {
          const total = c.usage.reduce((a, u) => a + u.calls, 0);
          return (
            <Card
              key={c.key}
              title={
                <span className="inline-flex flex-wrap items-center gap-2">
                  {c.label}
                  <span className="font-mono text-[12px] font-normal text-ink-3 [overflow-wrap:anywhere]">{c.current.model}</span>
                  <Badge tone={c.current.source === "admin" ? "accent" : "muted"}>{SOURCE_LABEL[c.current.source]}</Badge>
                  {c.fallback && <span className="text-xs font-normal text-ink-3">
                    Backup {c.fallback.model} · {c.fallback.primaryPaused
                      ? c.fallback.backupPaused ? "primary and backup both paused, waiting" : "taking over"
                      : c.fallback.backupPaused ? "unavailable for now" : "ready"}
                    {c.fallback.nextProbeAt && ` · primary rechecked with new requests after ${wallTime(c.fallback.nextProbeAt)}`}
                  </span>}
                </span>
              }
              right={
                <Button
                  size="sm"
                  onClick={() => {
                    setTarget(c);
                    setChoice(c.current.model);
                  }}
                >
                  Switch
                </Button>
              }
              pad={false}
            >
              {c.usage.length ? (
                <DataTable
                  dense
                  rows={c.usage}
                  rowKey={(u) => `${u.purpose}|${u.model}|${u.promptVersion}`}
                  columns={[
                    { key: "m", label: "Model", render: (u) => <span className="whitespace-nowrap font-mono text-[12px]">{u.model}</span> },
                    { key: "v", label: "Prompt version", render: (u) => <span className="whitespace-nowrap font-mono text-[11.5px] text-ink-3">{u.promptVersion ?? "—"}</span> },
                    { key: "p", label: "Purpose", render: (u) => <span className="whitespace-nowrap font-mono text-[11.5px] text-ink-3">{u.purpose}</span> },
                    { key: "c", label: "Calls", align: "right", render: (u) => num(u.calls) },
                    {
                      key: "ok",
                      label: "Success",
                      align: "right",
                      render: (u) => {
                        const rate = u.calls ? u.ok / u.calls : 0;
                        return <span className={rate < 0.95 ? "text-hot" : ""} title={`failed ${u.failed} · outcome unknown ${u.unknown}`}>{`${Math.round(rate * 1000) / 10}%`}</span>;
                      },
                    },
                    { key: "l", label: "Latency p50 / p95", align: "right", render: (u) => <span className="whitespace-nowrap">{`${secs(u.p50)} / ${secs(u.p95)}`}</span> },
                    { key: "t", label: "Input / output tokens", align: "right", render: (u) => <span className="whitespace-nowrap">{`${num(u.tokensIn)} / ${num(u.tokensOut)}`}</span> },
                    {
                      key: "$",
                      label: "Cost",
                      align: "right",
                      render: (u) =>
                        u.actualCost !== null ? (
                          money(u.actualCost, u.currency)
                        ) : u.estimate ? (
                          <span title="Usage × unit price">≈ {money(u.estimate.amount, u.estimate.currency)}</span>
                        ) : (
                          <Unpriced />
                        ),
                    },
                  ]}
                />
              ) : (
                <Empty>No calls in {m.days} days{total === 0 && c.vision ? " (used only when there are images)" : ""}</Empty>
              )}
            </Card>
          );
        })}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card title="Switches" pad={false}>
          {m.history.length ? (
            <DataTable
              dense
              rows={m.history}
              rowKey={(h) => `${h.at}|${h.subject}`}
              columns={[
                { key: "at", label: "Time", render: (h) => <span className="num whitespace-nowrap">{wallTime(h.at)}</span> },
                { key: "c", label: "Step", render: (h) => labelOf(h.subject) },
                { key: "m", label: "Change", render: (h) => <span className="font-mono text-[12px]">{h.before?.model ?? "—"} → {h.after?.model ?? "—"}</span> },
                { key: "r", label: "Reason", render: (h) => <span className="text-ink-3">{h.reason}</span> },
                { key: "a", label: "By", render: (h) => h.actor },
              ]}
            />
          ) : (
            <Empty>No model has been switched in the admin yet</Empty>
          )}
        </Card>
        <Card title="Comparisons on the same samples (SelectBench)" right={<Link to="/admin/selectbench" className="text-accent">All runs</Link>} pad={false}>
          {m.benches.length ? (
            <DataTable
              dense
              rows={m.benches}
              rowKey={(b) => b.id}
              columns={[
                { key: "l", label: "Run", render: (b) => <Link to={`/admin/selectbench/${b.id}`} className="text-ink hover:text-accent">{b.label}</Link> },
                { key: "m", label: "Model", render: (b) => <span className="font-mono text-[11.5px] text-ink-3">{b.models.join(", ")}</span> },
                { key: "n", label: "Cases", align: "right", render: (b) => num(b.sample_size) },
                { key: "at", label: "Time", render: (b) => <span className="num whitespace-nowrap">{wallTime(b.created_at)}</span> },
              ]}
            />
          ) : (
            <Empty>No comparison runs imported yet</Empty>
          )}
        </Card>
      </div>

      <ReasonDialog
        open={!!target}
        title={`Switch model: ${target?.label ?? ""}`}
        description="Affects only new tasks. “Back to default” returns to the environment or the code default."
        confirmLabel="Switch"
        busy={pending === "switch"}
        onClose={() => setTarget(null)}
        onSubmit={async (reason) =>
          (await run("POST", `/api/admin/models/${target!.key}`, { model: choice === "__default" ? null : choice, reason }, { label: "switch", success: "Switched; the next call uses it" })) !== null
        }
      >
        <Field label="Model">
          <Select value={choice} onChange={(e) => setChoice(e.target.value)}>
            {m.choices
              .filter((x) => !target?.vision || x.vision)
              .map((x) => (
                <option key={x.key} value={x.key}>
                  {x.key} ({x.service})
                </option>
              ))}
            <option value="__default">Back to default ({target?.env} or {target?.defaultModel})</option>
          </Select>
        </Field>
      </ReasonDialog>
    </AdminPage>
  );
}
