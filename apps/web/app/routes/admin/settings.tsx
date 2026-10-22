import { ADMIN, SITE } from "@aihot/site";
import { useRef, useState } from "react";
import type { Route } from "./+types/settings";
import type { AdminSettings } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { wallTime, num } from "../../features/admin/format";
import { AdminPage, Badge, Button, Card, DataTable, Input, ReasonDialog } from "../../features/admin/ui";
import { toast } from "../../features/admin/toast";


export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<AdminSettings>(request, "/api/admin/settings");
}

export const meta: Route.MetaFunction = () => [{ title: `Settings · ${SITE.name} admin` }];

function QrSlot({ slot, label, src }: { slot: "wechatQr" | "feishuQr"; label: string; src: string | null }) {
  const { run, pending } = useAdminAction();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-4">
      {src ? <img src={src} alt={label} className="size-28 rounded-card bg-white object-contain p-1.5 ring-1 ring-line" /> : <div className="flex size-28 shrink-0 items-center justify-center rounded-card bg-surface text-sm text-ink-4 ring-1 ring-line">Not set</div>}
      <div>
        <div className="text-[14px] font-medium text-ink">{label}</div>
        <div className="mt-0.5 break-all font-mono text-[11.5px] text-ink-4">{src}</div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) return toast("Images can be at most 2 MB", "error");
            const image = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            await run("POST", "/api/admin/settings/contact-qr", { slot, image }, { label: `qr-${slot}`, success: `${label} replaced; the About page updates within 5 minutes` });
          }}
        />
        <Button className="mt-2" size="sm" busy={pending === `qr-${slot}`} onClick={() => input.current?.click()}>Replace image</Button>
      </div>
    </div>
  );
}

function BudgetRow({ b }: { b: AdminSettings["budgets"][number] }) {
  const { run, pending } = useAdminAction();
  const [v, setV] = useState({ perMinute: b.per_minute, perHour: b.per_hour, perDay: b.per_day });
  const [open, setOpen] = useState(false);
  const changed = v.perMinute !== b.per_minute || v.perHour !== b.per_hour || v.perDay !== b.per_day;
  return (
    <tr className="border-b border-line/70 last:border-0">
      <td className="px-3 py-2 font-mono text-[12.5px]">{b.service}</td>
      {(["perMinute", "perHour", "perDay"] as const).map((k) => (
        <td key={k} className="px-3 py-2">
          <Input type="number" min={0} className="!w-24 !py-1 text-right" value={v[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} />
        </td>
      ))}
      <td className="num px-3 py-2 text-right text-ink-3">{num(b.used_hour)} / {num(b.used_day)}</td>
      <td className="px-3 py-2 text-right">
        <Button size="sm" tone="primary" disabled={!changed} onClick={() => setOpen(true)}>Save</Button>
        <ReasonDialog
          open={open}
          title={`Change the request limits of ${b.service}`}
          description={`Limits are the circuit breaker for paid requests: past one, requests pause and retry when the window allows. 0 stops the service at once.${ADMIN.budgetNote ? ` ${ADMIN.budgetNote}` : ""}`}
          confirmLabel="Save"
          busy={pending === "budget"}
          onClose={() => setOpen(false)}
          onSubmit={async (reason) => (await run("PUT", `/api/admin/budgets/${encodeURIComponent(b.service)}`, { ...v, reason }, { label: "budget", success: "Limits updated" })) !== null}
        />
      </td>
    </tr>
  );
}

function TargetToggle({ t }: { t: AdminSettings["targets"][number] }) {
  const { run, pending } = useAdminAction();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" tone={t.enabled ? "danger" : "primary"} onClick={() => setOpen(true)}>{t.enabled ? "Disable" : "Enable"}</Button>
      <ReasonDialog
        open={open}
        title={`${t.enabled ? "Disable" : "Enable"}: ${t.note ?? t.key}`}
        description={t.enabled ? "New pushes stop going to this group." : "The time it is enabled is recorded: earlier content is not pushed afterwards. Development and rehearsal environments never really send, even when enabled."}
        danger={t.enabled}
        confirmLabel={t.enabled ? "Disable" : "Enable"}
        busy={pending === "target"}
        onClose={() => setOpen(false)}
        onSubmit={async (reason) => (await run("POST", `/api/admin/notify-targets/${encodeURIComponent(t.key)}`, { enabled: !t.enabled, reason }, { label: "target", success: "Updated" })) !== null}
      />
    </>
  );
}

export default function SettingsAdmin({ loaderData: s }: Route.ComponentProps) {
  return (
    <AdminPage title="Settings" subtitle="Operating settings you can change without code. Every change goes into the audit log.">
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="About page QR codes">
          <div className="space-y-5">
            <QrSlot slot="wechatQr" label="WeChat account QR code" src={s.contact.wechatQr} />
            <QrSlot slot="feishuQr" label="Feishu group QR code" src={s.contact.feishuQr} />
          </div>
        </Card>
        <Card title="Notification targets" pad={false}>
          <DataTable
            rows={s.targets}
            rowKey={(t) => t.key}
            columns={[
              { key: "k", label: "Target", render: (t) => <div><div className="font-medium text-ink">{t.note ?? t.key}</div><div className="font-mono text-[11.5px] text-ink-4">{t.key} · {t.config_ref}</div></div> },
              { key: "e", label: "Status", render: (t) => (t.enabled ? <Badge tone="ok">Enabled {wallTime(t.enabled_at)}</Badge> : <Badge>Disabled</Badge>) },
              { key: "d", label: "Deliveries, 7 days", align: "right", render: (t) => num(t.deliveries_7d) },
              { key: "a", label: "", align: "right", render: (t) => <TargetToggle t={t} /> },
            ]}
          />
        </Card>
      </div>
      <Card className="mt-5" title="Paid request limits" right={<span>Used: last hour / last 24 hours</span>} pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-ink-3">
                <th className="px-3 py-2 font-medium">Service</th>
                <th className="px-3 py-2 font-medium">Per minute</th>
                <th className="px-3 py-2 font-medium">Per hour</th>
                <th className="px-3 py-2 font-medium">Per day</th>
                <th className="px-3 py-2 text-right font-medium">Used</th>
                <th />
              </tr>
            </thead>
            <tbody>{s.budgets.map((b) => <BudgetRow key={`${b.service}-${b.updated_at}`} b={b} />)}</tbody>
          </table>
        </div>
      </Card>
    </AdminPage>
  );
}
