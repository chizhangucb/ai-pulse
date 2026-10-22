// The engine's ways in, one panel each: what it is for, the steps to connect, then the details folded away.
// Addresses are the site's configured public address (`base`); what visitors copy carries the site's tag
// (CopyTag) when it has one.
import { Fragment, useState } from "react";
import { Link } from "react-router";
import { PUBLIC_INTERFACE_VERSION } from "@aihot/contracts/http-policy";
import { MCP_TOOL_NAMES as T, MCP_TOOLS } from "@aihot/contracts/mcp";
import { feedCategoryLabel, PUBLIC_API_CATEGORY_KEYS } from "@aihot/contracts/taxonomy";
import { ACCESS, AGENT, EDITION_WHEN, POLICY, REPORTS, SITE, subjectAfter, withSubject } from "@aihot/site";
import { CodeBlock, CopyButton } from "./CodeBlock";
import { PillTabs } from "../../components/ui/Tabs";
import type { AgentPanelProps } from "../../modules";
import { AGENT_PARTS, GUIDE_CLIENTS, TAG } from "./module-parts";
import { Address, Ask, Block, Bullets, Details, Mono, PanelHead, Step, Steps, Table, Tips } from "./parts";

const V = PUBLIC_INTERFACE_VERSION;

/** Every MCP tool: the engine's and the modules'. */
export const mcpToolCount = () => MCP_TOOLS.length + AGENT_PARTS.reduce((n, a) => n + (a.tools?.length ?? 0), 0);
const link = "text-accent hover:underline";

/** An address on this site as the copy buttons copy it, with the tag. */
function addressOf({ base, tag }: AgentPanelProps, path: string): string {
  return TAG && tag ? `${base}${path}?${TAG.query}=${tag}` : `${base}${path}`;
}

const MCP_CLIENTS = [
  { key: "claude", label: "Claude Code" },
  { key: "codex", label: "Codex" },
  { key: "json", label: "JSON config" },
  { key: "other", label: "Other clients" },
] as const;

export function McpPanel(props: AgentPanelProps) {
  const url = addressOf(props, "/api/mcp");
  const name = SITE.mcpPrefix;
  const [client, setClient] = useState<string>("claude");
  return (
    <>
      <PanelHead label={`MCP · ${V}`} title={`Add one address and your agent gets ${mcpToolCount()} tools`}>
        Standard Streamable HTTP, anonymous and read-only. No token, and it never reads your login. Works with clients that support remote MCP, such as Claude Desktop, Cursor and Cherry Studio.
      </PanelHead>
      <Steps>
        <Step n={1} title="Copy the server address">
          <Address url={url} />
          {TAG && <p className="mt-2 text-[13px] text-ink-3">{TAG.mcp}</p>}
        </Step>
        <Step n={2} title="Add it to your client">
          <PillTabs className="mt-3" size="xs" layoutId="agent-mcp-client" label="Client" active={client} onSelect={setClient} items={MCP_CLIENTS.map((c) => ({ key: c.key, label: c.label }))} />
          {client === "claude" && <CodeBlock className="mb-0 mt-3" lang="bash" code={`claude mcp add --transport http ${name} '${url}'`} />}
          {client === "codex" && <CodeBlock className="mb-0 mt-3" lang="bash" code={`codex mcp add ${name} --url '${url}'`} />}
          {client === "json" && <CodeBlock className="mb-0 mt-3" title="Clients configured with JSON, such as Cursor and Cherry Studio" lang="json" code={JSON.stringify({ mcpServers: { [name]: { type: "http", url } } }, null, 2)} />}
          {client === "other" && <p className="mt-3">{`In your client's MCP or connector settings, add an entry: name it ${name}, use the address above, choose "None" for authentication, and leave the API key empty. For clients that only support local commands, use their built-in remote MCP proxy.`}</p>}
        </Step>
        <Step n={3} title="Ask your agent to try it">
          <Ask text={`Call ${T.latest} and tell me the 5 most important ${SITE.subject} stories of the past 24 hours, with ${SITE.name} links.`} />
          <p className="mt-2 text-[13px] text-ink-3">{`If your client shows a call to ${T.latest} and the answer has a time range, English summaries and ${new URL(props.base).host} links, you are connected.`}</p>
        </Step>
      </Steps>

      <Block title={`${mcpToolCount()} tools`}>
        <Table
          head={["Tool", "What it does", "Try asking"]}
          minWidth={600}
          rows={[
            [<Mono>{T.latest}</Mono>, "Picks or all news from the past 24 hours or 7 days", `What ${SITE.subject} news is there today?`],
            [<Mono>{T.search}</Mono>, AGENT.search.scope, AGENT.search.ask],
            [<Mono>{T.hot}</Mono>, "Top 10 trending stories right now", "What is trending right now?"],
            [<Mono>{T.story}</Mono>, "A trending story's timeline and running overview", "What is the full story here?"],
            [<Mono>{T.daily}</Mono>, "The latest daily brief, or one by date", "Give me today's daily brief."],
            [<Mono>{T.weekly}</Mono>, "The latest weekly brief, or one by week", `What were the big ${SITE.subject} stories this week?`],
            [<Mono>{T.monthly}</Mono>, "The latest monthly brief, or one by month", `What happened in ${SITE.subject} last month?`],
            ...AGENT_PARTS.flatMap((a) => a.tools ?? []).map((t) => [<Mono>{t.name}</Mono>, t.does, t.ask]),
          ]}
        />
      </Block>

      <Details
        items={[
          {
            title: "Limits and safety",
            body: (
              <Bullets items={[
                "Ordinary queries return at most 30 items, trending at most 10, and a story timeline at most 50. Going past a limit is a clear error, never a silent widening.",
                `The public_id for ${T.story} must come from a story link returned by the trending tool. Do not guess IDs.`,
                "Titles and summaries come from outside sources and are material only; the tools mark this safety boundary. Check important numbers, policies and quotes against the original.",
              ]} />
            ),
          },
          {
            title: "Can't connect?",
            body: (
              <Bullets items={[
                "Check that the address is complete and that your client supports remote Streamable HTTP. If new tools are missing, refresh the tool list or reconnect.",
                ...AGENT_PARTS.flatMap((a) => a.mcpTroubles ?? []),
                "The service needs no login. If your client asks for OAuth or an API key, choose None.",
                "On a 429, wait as told and do not retry in parallel.",
                <>Still stuck? Send your client's name, version and error on the <Link viewTransition to="/feedback" className={link}>feedback page</Link>.</>,
              ]} />
            ),
          },
        ]}
      />
    </>
  );
}

const FEEDS = [
  { name: "Picks", badge: "Recommended", path: "/feed.xml", desc: "The latest 50 picks, with title, summary, a link to read on the site and the original link." },
  { name: "Picks, full text", path: "/feed/full.xml", desc: "The same 50 items; full text where the source allows republishing, a summary otherwise." },
  { name: "All news", path: "/feed/all.xml", desc: "All public news from the last 7 days, newest first by original publication time." },
  { name: withSubject("Daily"), path: "/feed/daily.xml", desc: `One issue ${EDITION_WHEN.daily}: the lead story and the full contents. Keeps the last 30 issues.` },
  { name: withSubject("Weekly"), path: "/feed/weekly.xml", desc: `One issue ${EDITION_WHEN.weekly}: an overview plus the ${REPORTS.entry.noun} by section. Keeps the last 12 issues.` },
  { name: withSubject("Monthly"), path: "/feed/monthly.xml", desc: `One issue ${EDITION_WHEN.monthly}: an overview plus the ${REPORTS.entry.noun} by section. Keeps the last 12 issues.` },
];

/** The category feeds, under the names the feeds themselves use. */
const FEED_CATEGORIES = PUBLIC_API_CATEGORY_KEYS.map((key) => [key, feedCategoryLabel(key)] as const);

export function RssPanel(props: AgentPanelProps) {
  const { base } = props;
  const lead = `${["Works with mainstream RSS 2.0 readers and automation tools such as n8n and Zapier. The addresses do not change", ...AGENT_PARTS.flatMap((a) => a.rssLead ?? [])].join("; ")}.`;
  return (
    <>
      <PanelHead label="RSS" title="Copy an address and subscribe in your reader">
        {lead}
      </PanelHead>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FEEDS.map((f) => (
          <div key={f.path} className="card flex flex-col p-4">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-ink">{f.name}</span>
              {f.badge && <span className="inline-flex h-[18px] items-center rounded-full bg-accent-soft px-2 text-[11px] font-medium text-accent">{f.badge}</span>}
            </div>
            <p className="mt-1 flex-1 text-[13px] leading-[1.7] text-ink-3">{f.desc}</p>
            <div className="mt-3 flex items-center gap-2 border-t border-line-soft pt-3">
              <code className="mono min-w-0 flex-1 truncate text-[12px] text-ink-4">{base}{f.path}</code>
              <CopyButton text={addressOf(props, f.path)} label="Copy address" className="shrink-0" />
            </div>
          </div>
        ))}
      </div>
      {TAG && <p className="mt-3 text-[12.5px] text-ink-4">{TAG.rss}</p>}

      <Block title="Subscribe by category">
        <Table
          head={["Category", "Summary", "Full text"]}
          minWidth={420}
          rows={FEED_CATEGORIES.map(([slug, label]) => [
            <span className="font-medium text-ink">{label}</span>,
            <span className="inline-flex items-center gap-2"><Mono>{`/feed/category/${slug}.xml`}</Mono><CopyButton text={addressOf(props, `/feed/category/${slug}.xml`)} className="!h-6 !px-1.5" /></span>,
            <span className="inline-flex items-center gap-2"><Mono>{`/feed/full/category/${slug}.xml`}</Mono><CopyButton text={addressOf(props, `/feed/full/category/${slug}.xml`)} className="!h-6 !px-1.5" /></span>,
          ])}
        />
      </Block>

      <Block title="How often to refresh">
        <p>Readers send the last ETag, and when nothing changed they get a tiny 304 instead of the whole feed. Refreshing every 30 minutes is enough; faster gets nothing new.</p>
        <p className="mt-3 text-[13px] text-ink-3">{`Item links go to the reading page on this site; the original link is in the summary. Anonymous access does not mean every use is permitted${POLICY.terms.notes ? `: ${POLICY.terms.notes.rss}` : ""}. See `}<Link viewTransition to="/terms" className={link}>{POLICY.terms.name}</Link>.</p>
      </Block>
    </>
  );
}

const RECIPES = [
  { key: "latest", label: "Follow the latest" },
  { key: "sync", label: "Sync all picks" },
];

export function ApiPanel(props: AgentPanelProps) {
  const { base, tag } = props;
  const userAgent = [ACCESS.userAgent, TAG && tag ? TAG.userAgent(tag) : null].filter(Boolean).join(" ");
  const curl = `curl --compressed${userAgent ? ` -A '${userAgent}'` : ""}`;
  let pace = `How often things change: news arrives all day, picks change a few to a few dozen times a day, the daily brief comes out ${EDITION_WHEN.daily}, the weekly ${EDITION_WHEN.weekly} and the monthly ${EDITION_WHEN.monthly}.`;
  if (ACCESS.ratePerMinute) pace += ` Over about ${ACCESS.ratePerMinute} requests a minute from one IP gets a 429; wait as Retry-After says and do not retry in parallel.`;
  const [recipe, setRecipe] = useState<string>("latest");
  const recipes = AGENT_PARTS.flatMap((a) => a.recipes ?? []);
  const items = `${base}/api/v1/items?mode=selected&window=24h&limit=20`;
  return (
    <>
      <PanelHead label={`REST API · ${V}`} title="Anonymous GET, ready to use">
        No token. Browsers (cross-origin), curl and every language's default HTTP client can call it directly. The path is /api/v1; fields and error codes are defined in the <a href="/openapi-v1.json" className={link}>OpenAPI</a> file.
      </PanelHead>
      <CodeBlock className="mt-6" title="Your first request" lang="bash" code={`${curl} '${items}'`} />

      <Block title="Filter by category">
        <p>Add <Mono>category</Mono> to an items request to get one category; leave it out for all. Returned items use the same values in their <Mono>category</Mono>.</p>
        <Table head={["Category", "Parameter"]} rows={FEED_CATEGORIES.map(([key, name]) => [name, <Mono>{`category=${key}`}</Mono>])} />
      </Block>

      <Block title="Use less, go faster">
        <Tips
          items={[
            { title: "Turn on compression", text: <>Add <Mono>--compressed</Mono> to curl, or turn on gzip or br in other clients. Compressed JSON is 1/4 to 1/8 the size.</> },
            { title: "Send the ETag", text: <>Keep the response ETag and send it as <Mono>If-None-Match</Mono> next time; when nothing changed you get a 304 with no body.</> },
            { title: "Fetch at the right pace", text: `Items and trending at most once a minute; the daily brief once after it comes out ${EDITION_WHEN.daily}, the weekly and monthly once after they come out; when paging back, stop at an item you already have.` },
          ]}
        />
        <p className="mt-3 text-[13px] leading-[1.75] text-ink-3">{pace}</p>
      </Block>

      <Block title="Endpoints">
        <Table
          head={["Path", "What it is for", "How often"]}
          minWidth={640}
          rows={[
            { group: "News" },
            [<Mono>/api/v1/items</Mono>, "Picks or all news from the last 7 days, filtered by category, time window or keyword", "At most once a minute"],
            { group: "Trending and stories" },
            [<Mono>/api/v1/hot-topics</Mono>, "Top 10 trending stories right now", "At most once a minute"],
            [<Mono>{"/api/v1/stories/{publicId}"}</Mono>, "A story's report timeline, AI overview and related stories", "When needed"],
            { group: "Daily brief" },
            [<Mono>/api/v1/dailies/latest</Mono>, "The latest daily brief", `Once after it comes out ${EDITION_WHEN.daily}`],
            [<Mono>{"/api/v1/dailies/{date}"}</Mono>, "The daily brief for a date; withdrawn items are removed", "Revalidate the ETag after the cache expires"],
            [<Mono>/api/v1/dailies</Mono>, "Index of daily brief dates", "Once a day"],
            { group: "Weekly and monthly briefs" },
            [<Mono>/api/v1/weeklies/latest</Mono>, "The latest weekly brief: the lead, an overview and the week's top stories by section", `Once after it comes out ${EDITION_WHEN.weekly}`],
            [<Mono>{"/api/v1/weeklies/{week}"}</Mono>, "A given week, as an ISO week such as 2026-W39; withdrawn items are removed", "Revalidate the ETag after the cache expires"],
            [<Mono>/api/v1/weeklies</Mono>, "Index of weekly briefs", "Once a week"],
            [<Mono>/api/v1/monthlies/latest</Mono>, "The latest monthly brief", `Once after it comes out ${EDITION_WHEN.monthly}`],
            [<Mono>{"/api/v1/monthlies/{month}"}</Mono>, "A given month, such as 2026-09", "Revalidate the ETag after the cache expires"],
            [<Mono>/api/v1/monthlies</Mono>, "Index of monthly briefs", "Once a month"],
            ...AGENT_PARTS.flatMap((a) => (a.api ? [{ group: a.api.group }, ...a.api.rows.map(([path, does, often]) => [<Mono>{path}</Mono>, does, often])] : [])),
            { group: "For AI assistants" },
            [<Mono>/api/v1/agent</Mono>, `The guide for agents; the addresses it lists return ready-to-read Markdown${GUIDE_CLIENTS ? `. ${GUIDE_CLIENTS} use them` : ""}`, "When needed"],
            { group: "Full picks sync" },
            [<Mono>/api/v1/selected/snapshot</Mono>, "Every current pick, paged, to get them all at once", "Only the first time"],
            [<Mono>/api/v1/selected/changes</Mono>, "Later additions, edits and removals", "Every few minutes"],
          ]}
        />
      </Block>

      <Block title="Common recipes">
        <PillTabs size="xs" layoutId="agent-api-recipe" label="Recipe" active={recipe} onSelect={setRecipe} items={[...RECIPES, ...recipes].map((r) => ({ key: r.key, label: r.label }))} />
        {recipe === "latest" && (
          <>
            <CodeBlock className="mb-3 mt-3" lang="bash" code={`# First time: keep the ETag from the response headers\n${curl} -i '${items}'\n# Then at most once a minute, with the ETag; a 304 means nothing changed\n${curl} -i -H 'If-None-Match: <last ETag>' '${items}'`} />
            <p>To page back, pass <Mono>page.nextCursor</Mono> back as cursor and stop at an item you already have; do not re-read all 7 days every time.</p>
          </>
        )}
        {recipe === "sync" && (
          <>
            <CodeBlock className="mb-3 mt-3" lang="bash" code={`# First time: page through everything. Keep the cursor from the first page (it is the same on every page)\n${curl} '${base}/api/v1/selected/snapshot?fields=minimal&limit=500'\n# While hasMore is true, pass nextPage to keep going\n${curl} '${base}/api/v1/selected/snapshot?fields=minimal&limit=500&page=<previous nextPage>'\n# After that: pass the cursor back as is to get only additions, edits and removals\n${curl} '${base}/api/v1/selected/changes?cursor=<first page cursor>&limit=100'`} />
            <p>Save the new cursor only after each page is written locally. A cursor is a position in the change log and never expires; on a 409 <Mono>snapshot_required</Mono>, take a fresh snapshot, so nothing is silently missed.</p>
          </>
        )}
        {recipes.map((r) => recipe === r.key && <r.Body key={r.key} base={base} curl={curl} />)}
      </Block>

      <Block title="When something goes wrong" id="agent-api-recovery">
        <dl className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-3 gap-y-2.5">
          <dt className="mono text-[13px] text-ink">400</dt>
          <dd>Bad parameters: fix them by the OpenAPI file and the returned code; do not switch to a wider query automatically. An invalid cursor, or one outside the time window, returns invalid_cursor; start again from the first page.</dd>
          <dt className="mono text-[13px] text-ink">409</dt>
          <dd>snapshot_required: changes cannot safely continue; take a full snapshot again.</dd>
          <dt className="mono text-[13px] text-ink">429</dt>
          <dd>Too many requests: wait as Retry-After says and do not retry in parallel.</dd>
          <dt className="mono text-[13px] text-ink">5xx</dt>
          <dd>Back off exponentially and use the last good result meanwhile; the public service has no SLA.</dd>
          {AGENT_PARTS.flatMap((a) => a.apiErrors ?? []).map(([status, what]) => (
            <Fragment key={status}>
              <dt className="mono text-[13px] text-ink">{status}</dt>
              <dd>{what}</dd>
            </Fragment>
          ))}
        </dl>
        <p className="mt-4 text-[13px] text-ink-3">{`Anonymous access does not mean every use is permitted${POLICY.terms.notes ? `: ${POLICY.terms.notes.api}` : ""}. See `}<Link viewTransition to="/terms" className={link}>{POLICY.terms.name}</Link>.</p>
      </Block>

    </>
  );
}
