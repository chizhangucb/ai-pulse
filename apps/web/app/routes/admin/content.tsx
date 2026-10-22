import { SITE } from "@aihot/site";
import { Form, Link, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/content";
import type { AdminContentRow, AdminContentSearch } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { VISIBILITY_LABEL } from "../../features/admin/labels";
import { AdminPage, Badge, Button, Card, DataTable, Empty, Input, Time } from "../../features/admin/ui";


export async function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return { q, rows: [] as AdminContentRow[] };
  const { rows } = await adminGet<AdminContentSearch>(request, `/api/admin/content?q=${encodeURIComponent(q)}`);
  return { q, rows };
}

export const meta: Route.MetaFunction = () => [{ title: `Content · ${SITE.name} admin` }];

export default function Content({ loaderData }: Route.ComponentProps) {
  const { q, rows } = loaderData;
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  return (
    <AdminPage title="Content" subtitle="Find any item by ID, original link or title and follow it from its source to every public output. Withdrawing, summary only, manual corrections and reprocessing are on its detail page.">
      <Form method="get" className="mb-5 flex max-w-2xl gap-2">
        <Input name="q" defaultValue={sp.get("q") ?? ""} placeholder="Item ID, URL or words of the title" aria-label="Search content" autoFocus />
        <Button type="submit" tone="primary">Find</Button>
      </Form>
      {q && (
        <Card pad={false} title={`Results for “${q}”`} right={<span>{rows.length === 50 ? "Showing the latest 50" : `${rows.length} items`}</span>}>
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/admin/content/${r.id}`)}
            empty="Nothing found. URLs are normalized before matching; titles match any fragment."
            columns={[
              {
                key: "t",
                label: "Title",
                render: (r) => (
                  <div className="min-w-[320px]">
                    <Link to={`/admin/content/${r.id}`} className="font-medium text-ink hover:text-accent" onClick={(e) => e.stopPropagation()}>{r.title}</Link>
                    <div className="font-mono text-[11.5px] text-ink-4">{r.id}</div>
                  </div>
                ),
              },
              { key: "src", label: "Source", render: (r) => <span className="whitespace-nowrap">{r.source}</span> },
              {
                key: "st",
                label: "Status",
                render: (r) => (
                  <span className="flex flex-wrap gap-1">
                    {r.selected && <Badge tone="accent">Pick</Badge>}
                    {r.visibility && <Badge tone={r.visibility === "public" ? "muted" : "warn"}>{VISIBILITY_LABEL[r.visibility] ?? r.visibility}</Badge>}
                    {!r.visibility && <Badge>{r.processing_state}</Badge>}
                  </span>
                ),
              },
              { key: "sc", label: "Score", align: "right", render: (r) => r.score ?? "—" },
              { key: "d", label: "Found", render: (r) => <Time at={r.discovered_at} /> },
            ]}
          />
        </Card>
      )}
      {!q && <Empty>Enter an ID, link or title to start.</Empty>}
    </AdminPage>
  );
}
