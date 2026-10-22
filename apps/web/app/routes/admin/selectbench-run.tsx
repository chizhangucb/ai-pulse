import { SITE } from "@aihot/site";
import { Fragment, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { CATEGORY_LABELS } from "@aihot/contracts/taxonomy";
import type { Route } from "./+types/selectbench-run";
import type { AdminSelectBenchCases, AdminSelectBenchDecision } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { wallTime, num, pct } from "../../features/admin/format";
import { AdminPage, Badge, Card, Empty, FilterChips, Select } from "../../features/admin/ui";


export async function loader({ request, params }: Route.LoaderArgs) {
  return adminGet<AdminSelectBenchCases>(request, `/api/admin/selectbench/${encodeURIComponent(params.runId)}${new URL(request.url).search}`);
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `${loaderData?.run.label ?? "SelectBench"} · ${SITE.name} admin` }];

const GOLD: Record<string, [string, "accent" | "muted" | "info"]> = { select: ["Pick", "accent"], reject: ["Skip", "muted"], either: ["Either", "info"] };

function verdict(d: AdminSelectBenchDecision | undefined, gold: string) {
  if (!d) return <span className="text-ink-4">—</span>;
  if (d.decision === null) return <Badge tone="bad" title={d.error ?? undefined}>Failed</Badge>;
  const right = gold === "either" || d.decision === gold;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={right ? (d.decision === "select" ? "ok" : "muted") : "bad"}>{d.decision === "select" ? "Picked" : "Skipped"}</Badge>
      <span className="num text-[12px] text-ink-3">{d.score ?? "—"}</span>
    </span>
  );
}

export default function SelectBenchRun({ loaderData: d }: Route.ComponentProps) {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>(null);
  const model = sp.get("model") ?? d.run.models[0]!;
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v);
    else next.delete(k);
    navigate(`?${next}`, { preventScrollReset: true });
  };
  return (
    <AdminPage
      title={d.run.label}
      subtitle={<>{wallTime(d.run.created_at, true)} · {d.run.split ?? "—"} · {num(d.run.sample_size)} cases · prompt {d.run.prompt_version ?? "not recorded"} · <Link className="text-accent" to="/admin/selectbench">All runs</Link></>}
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {d.run.models.map((m) => {
          const s = d.run.summary[m] ?? {};
          return (
            <button key={m} onClick={() => set("model", m)} className={`rounded-panel p-4 text-left ring-1 transition-colors ${m === model ? "bg-accent-softer ring-accent/40" : "bg-surface ring-line hover:bg-bg-sunk/60"}`}>
              <div className="text-[13.5px] font-semibold text-ink">{m}</div>
              <div className="num mt-1.5 text-[22px] font-semibold tracking-tight text-ink">F1 (valid outputs) {pct(s.f1)}</div>
              <div className="num mt-0.5 text-[12px] text-ink-3">Accuracy (valid) {pct(s.accuracy)} · coverage {pct(s.coverage)} · accuracy (all) {pct(s.completeAccuracy)}</div>
              <div className="num mt-0.5 text-[12px] text-ink-3">Precision {pct(s.precision)} · recall {pct(s.recall)} · gold picks {pct(s.goldSelectRate)}</div>
              <div className="num mt-0.5 text-[12px] text-ink-4">False picks {s.fp ?? "—"} · missed {s.fn ?? "—"} · {s.decisiveErrors !== undefined ? <>failed on decided cases {s.decisiveErrors}{s.eitherErrors ? ` · failed on either cases ${s.eitherErrors}` : ""}</> : <>failed {s.errors ?? 0}</>}</div>
            </button>
          );
        })}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FilterChips
          param="outcome"
          options={[
            { value: "", label: "All" },
            { value: "fp", label: "False picks" },
            { value: "fn", label: "Missed" },
            { value: "tp", label: "Right picks" },
            { value: "tn", label: "Right skips" },
            { value: "either", label: "Either" },
            { value: "error", label: "Failed" },
          ]}
        />
        <Select className="!w-auto" aria-label="Stratum" value={sp.get("stratum") ?? ""} onChange={(e) => set("stratum", e.target.value || null)}>
          <option value="">All strata</option>
          {d.strata.map((s) => <option key={s.stratum ?? "none"} value={s.stratum ?? ""}>{s.stratum ?? "no stratum"} ({s.n})</option>)}
        </Select>
        <label className="inline-flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={sp.get("disagree") === "1"} onChange={(e) => set("disagree", e.target.checked ? "1" : null)} />
          Only cases where the models disagree
        </label>
        <span className="text-[12.5px] text-ink-4">{d.rows.length === 400 ? "Showing the first 400" : `${d.rows.length} cases`} · filtered by {model}</span>
      </div>
      <Card pad={false}>
        {d.rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-ink-3">
                  <th className="px-3 py-2 font-medium">Case</th>
                  <th className="px-3 py-2 font-medium">Gold</th>
                  {d.run.models.map((m) => <th key={m} className="px-3 py-2 font-medium">{m}</th>)}
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <Fragment key={r.case_id}>
                    <tr className="cursor-pointer border-b border-line/70 hover:bg-bg-sunk/50" onClick={() => setOpen(open === r.case_id ? null : r.case_id)}>
                      <td className="max-w-[420px] px-3 py-2.5">
                        <div className="line-clamp-2 text-ink">{r.title}</div>
                        <div className="mt-0.5 text-[11.5px] text-ink-4">{r.stratum ?? "—"} · {r.case_id}</div>
                      </td>
                      <td className="px-3 py-2.5"><Badge tone={GOLD[r.gold]?.[1] ?? "muted"}>{GOLD[r.gold]?.[0] ?? r.gold}</Badge></td>
                      {d.run.models.map((m) => <td key={m} className="px-3 py-2.5">{verdict(r.by_model[m], r.gold)}</td>)}
                    </tr>
                    {open === r.case_id && (
                      <tr className="border-b border-line/70 bg-bg-sunk/40">
                        <td colSpan={2 + d.run.models.length} className="px-3 py-3">
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {d.run.models.map((m) => {
                              const x = r.by_model[m];
                              return (
                                <div key={m} className="rounded-control bg-surface p-3 ring-1 ring-line">
                                  <div className="mb-1 flex items-center justify-between text-[12px] text-ink-3"><span className="font-medium text-ink-2">{m}</span>{x?.category && <span>{CATEGORY_LABELS[x.category as keyof typeof CATEGORY_LABELS] ?? x.category}</span>}</div>
                                  <div className="text-[12.5px] leading-relaxed text-ink-2">{x?.error ?? x?.reason ?? "(no reason)"}</div>
                                  <div className="mt-1 text-[11.5px] text-ink-4">Relevance {x?.relevance ?? "—"}{x?.receiptId ? ` · receipt #${x.receiptId}` : ""}</div>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No matching cases</Empty>
        )}
      </Card>
    </AdminPage>
  );
}
