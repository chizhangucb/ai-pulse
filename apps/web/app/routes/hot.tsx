import { useLoaderData } from "react-router";
import { IntentLink } from "../components/ui/IntentLink";
import type { HotEntryView, HotResponse } from "@aihot/contracts/site";
import { SITE } from "@aihot/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { pageMeta } from "../lib/seo";
import { monthDayTime } from "../lib/format";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/Page";
import { IconChevronDown, IconInfo } from "../components/icons";
import { Sparkline } from "../features/hot/Sparkline";
import { Faces } from "../features/hot/Faces";
import { Delta } from "../features/hot/Delta";
import { PhoneBar } from "../components/shell/PhoneBar";
import { navUp } from "../components/shell/nav";
import { scrollBehavior } from "../lib/motion";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { tab: navUp("/hot").tab, name: "Trending" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: { request: Request }) {
  return cachedPage(120, { hot: await loadOr404<HotResponse>("/api/site/hot", { signal: request.signal }) });
}

export function meta() {
  return pageMeta({
    title: `Trending ${SITE.subject} stories`,
    description: `The 10 most discussed ${SITE.subject} stories of the last 48 hours: heat, trend, and who is reporting them.`,
    path: "/hot",
    image: "/og/pages/hot.png",
  });
}

const BADGES: Record<HotEntryView["badges"][number], { label: string; tone: "hot" | "accent" | "amber"; hint: string }> = {
  surge: { label: "Surging", tone: "hot", hint: "Discussion growing fast" },
  new: { label: "New", tone: "accent", hint: "First reported within 6 hours" },
  rising: { label: "Rising", tone: "amber", hint: "Discussion still growing" },
};

const RANK_COLOR = ["text-rank-1", "text-rank-2", "text-rank-3"];
const rankColor = (rank: number) => RANK_COLOR[rank - 1] ?? "text-rank-rest";
const pad = (rank: number) => String(rank).padStart(2, "0");

/** "A paper, an account and 2 more sources · 7 participants". */
function Voices({ e }: { e: HotEntryView }) {
  const names = e.sourceNames.slice(0, 2);
  return (
    <span className="min-w-0 text-[12.5px] leading-snug text-ink-4">
      {/* Lines break between the phrases, never inside one. */}
      <span className="whitespace-nowrap">
        {names.length > 0 && <span className="text-ink-3">{names.join(", ")}</span>}
        {e.sourceCount > names.length ? ` and ${e.sourceCount - names.length} more` : names.length ? " reported" : `${e.sourceCount} sources`}
      </span>
      <span className="mx-1.5 text-line-strong">·</span>
      <span className="whitespace-nowrap">
        <span className="num">{e.participantCount}</span> participants
      </span>
    </span>
  );
}

function Badges({ e }: { e: HotEntryView }) {
  return e.badges.map((b) => (
    <Badge key={b} tone={BADGES[b].tone} title={BADGES[b].hint}>
      {BADGES[b].label}
    </Badge>
  ));
}

/** The whole card opens the event; the title carries the link and stretches over the card. */
function StoryLink({ e, className }: { e: HotEntryView; className: string }) {
  return (
    <IntentLink viewTransition to={`/story/${e.story.publicId}`} className={`transition-colors after:absolute after:inset-0 after:content-[''] ${className}`}>
      {e.story.title}
    </IntentLink>
  );
}

/**
 * The lead card's picture slot when the story has no picture of its own: its day of heat, drawn large
 * on a faint wash, with where it peaked. Without enough comparable hours the text takes the width.
 */
function HeatPanel({ e }: { e: HotEntryView }) {
  const seen = e.spark.filter((v): v is number => v !== null);
  const peak = Math.max(...seen);
  const peakAt = e.spark.findIndex((v) => v === peak);
  return (
    <div className="order-first flex aspect-[2/1] flex-col rounded-panel bg-accent-softer p-4 ring-1 ring-inset ring-line-soft xl:order-none xl:aspect-[16/10] dark:bg-accent-soft">
      <div className="flex items-baseline justify-between text-[11.5px] text-ink-4">
        <span className="font-semibold text-ink-3">24-hour heat</span>
        <span>
          Peak <span className="mono text-ink-2">{Math.round(peak)}</span>
          {peakAt >= 0 && <span> · {peakAt === e.spark.length - 1 ? "now" : `${e.spark.length - 1 - peakAt} hr ago`}</span>}
        </span>
      </div>
      <Sparkline values={e.spark} className="mt-3 min-h-0 w-full flex-1" />
      <div className="mt-2 flex justify-between text-[11px] text-ink-4">
        <span>24 hr ago</span>
        <span>Now</span>
      </div>
    </div>
  );
}

/** No. 1: the event people are talking about most, with its picture, digest, latest turn and day of heat. */
function Lead({ e }: { e: HotEntryView }) {
  const panel = !e.cover && e.spark.filter((v) => v !== null).length >= 3;
  return (
    <article className="card card-hover group relative flex flex-col overflow-hidden p-5 sm:p-6">
      <div className="flex items-center gap-2.5">
        <span className={`mono text-[12px] font-bold tracking-[0.16em] ${rankColor(e.rank)}`}>NO.{pad(e.rank)}</span>
        <Badges e={e} />
        <Delta trend={e.trend} pct={e.trendPct} className="ml-auto" />
      </div>
      <div className={`mt-4 grid gap-5 ${e.cover || panel ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,0.72fr)] xl:gap-7" : ""}`}>
        <div className="min-w-0">
          <h2 className="text-[21px] font-bold leading-[1.4] tracking-[-0.01em] text-ink sm:text-[23px] lg:text-[25px] lg:leading-[1.38]">
            <StoryLink e={e} className="group-hover:text-accent" />
          </h2>
          {e.summary && <p className="mt-3 line-clamp-3 text-[14px] leading-[1.75] text-ink-3">{e.summary}</p>}
        </div>
        {e.cover ? (
          <div className="order-first overflow-hidden well rounded-panel xl:order-none">
            <img src={e.cover.url} srcSet={e.cover.srcSet} sizes="(min-width: 1280px) calc(28vw - 96px), (min-width: 1024px) calc(58vw - 180px), (min-width: 640px) 568px, calc(100vw - 74px)" width={e.cover.width ?? undefined} height={e.cover.height ?? undefined} alt="" loading="eager" fetchPriority="high" decoding="async" className="aspect-[16/9] size-full object-cover transition-transform duration-500 group-hover:scale-[1.02] xl:aspect-[16/10]" />
          </div>
        ) : (
          panel && <HeatPanel e={e} />
        )}
      </div>
      {/* Side by side while the card is wide enough; on a narrow card the day of heat and the index
          move under the voices, to the right, instead of squeezing them into a column. */}
      <div className="mt-auto flex flex-wrap items-end gap-x-6 gap-y-4 pt-5">
        <div className="min-w-0 flex-[1_1_18rem] space-y-2.5">
          {e.latest && (
            <p className="line-clamp-2 text-[13px] leading-[1.7] text-ink-2">
              <span className="mr-2 text-[12px] font-semibold text-accent">Latest</span>
              {e.latest}
            </p>
          )}
          {/* The voices drop under the faces when the card is too narrow for both (small phones). */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Faces participants={e.participants} total={e.participantCount} size={24} />
            <Voices e={e} />
          </div>
        </div>
        <div className="flex w-full shrink-0 items-end justify-between gap-5 sm:ml-auto sm:w-auto sm:justify-end">
          {!panel && <Sparkline values={e.spark} className="h-10 w-[140px]" />}
          <div className="text-right">
            <div className="mono text-[34px] font-semibold leading-none tracking-[-0.03em] text-ink">{Math.round(e.heat)}</div>
            <div className="mt-1 text-[11.5px] text-ink-4">Heat index</div>
          </div>
        </div>
      </div>
    </article>
  );
}

/** No. 2 and 3: the same card, smaller, without the picture. */
function Runner({ e }: { e: HotEntryView }) {
  return (
    <article className="card card-hover group relative flex flex-col px-5 py-4">
      <div className="flex items-center gap-2.5">
        <span className={`mono text-[12px] font-bold tracking-[0.16em] ${rankColor(e.rank)}`}>NO.{pad(e.rank)}</span>
        <Badges e={e} />
        <Delta trend={e.trend} pct={e.trendPct} className="ml-auto" />
      </div>
      <h2 className="mt-2.5 line-clamp-2 text-[16px] font-[650] leading-[1.5] text-ink">
        <StoryLink e={e} className="group-hover:text-accent" />
      </h2>
      {e.summary && <p className="mt-1.5 line-clamp-2 text-[13px] leading-[1.7] text-ink-3 lg:line-clamp-1">{e.summary}</p>}
      <div className="mt-auto flex items-end justify-between gap-4 pt-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Faces participants={e.participants} total={e.participantCount} size={20} />
          <span className="text-[12px] text-ink-4">
            <span className="whitespace-nowrap"><span className="num">{e.sourceCount}</span> sources</span> ·{" "}
            <span className="whitespace-nowrap"><span className="num">{e.participantCount}</span> participants</span>
          </span>
        </div>
        <div className="flex items-end gap-3">
          <Sparkline values={e.spark} className="h-7 w-[92px]" />
          <span className="mono text-[24px] font-semibold leading-none tracking-[-0.02em] text-ink">{Math.round(e.heat)}</span>
        </div>
      </div>
    </article>
  );
}

/** No. 4–10: a row each, with a line of the digest, faces, the day of heat and the index. */
function Row({ e }: { e: HotEntryView }) {
  return (
    <li className="group relative grid grid-cols-[30px_minmax(0,1fr)] items-start gap-x-3 px-4 py-3 transition-colors hover:bg-bg-sunk/70 sm:px-5 lg:grid-cols-[44px_minmax(0,1fr)_auto_104px_76px] lg:items-center lg:gap-x-6 lg:px-6 lg:py-3.5 dark:hover:bg-bg-muted/40">
      <span className={`mono text-[16px] font-semibold leading-[24px] lg:text-[17px] ${rankColor(e.rank)}`} aria-label={`Heat rank ${e.rank}`}>
        {pad(e.rank)}
      </span>
      <div className="min-w-0">
        <h3 className="text-[15px] font-[650] leading-[1.55] text-ink">
          <StoryLink e={e} className="group-hover:text-accent" />
          {e.badges.length > 0 && (
            <span className="ml-2 inline-flex translate-y-[-2px] gap-1 align-middle">
              <Badges e={e} />
            </span>
          )}
        </h3>
        {e.summary && <p className="mt-0.5 line-clamp-2 text-[13px] leading-[1.65] text-ink-4 lg:line-clamp-1">{e.summary}</p>}
        <div className="mt-2 flex items-center gap-2.5 lg:hidden">
          <Faces participants={e.participants} total={e.participantCount} size={20} />
          <span className="text-[12px] text-ink-4">
            <span className="num">{e.sourceCount}</span> sources
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span className="mono text-[17px] font-semibold leading-none text-ink">{Math.round(e.heat)}</span>
            <Delta trend={e.trend} pct={e.trendPct} />
          </span>
        </div>
      </div>
      <div className="hidden items-center gap-2.5 lg:flex">
        <Faces participants={e.participants} total={e.participantCount} size={20} />
      </div>
      <Sparkline values={e.spark} className="hidden h-7 w-[104px] lg:block" />
      <div className="hidden flex-col items-end gap-1 lg:flex">
        <span className="mono text-[20px] font-semibold leading-none tracking-[-0.02em] text-ink">{Math.round(e.heat)}</span>
        <Delta trend={e.trend} pct={e.trendPct} />
      </div>
    </li>
  );
}

/** Opens "How is heat calculated" at the foot of the page and brings it into view. */
function showMethod() {
  const method = document.getElementById("hot-method") as HTMLDetailsElement | null;
  if (!method) return;
  method.open = true;
  method.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
}

export default function HotPage() {
  const { hot } = useLoaderData<typeof loader>();
  const [lead, ...rest] = hot.entries;
  const runners = rest.slice(0, 2);
  const others = rest.slice(2);
  return (
    <div className="pb-10">
      <PhoneBar
        title="Trending"
        large
        sub={
          <>
            The {hot.entries.length || 10} most discussed {SITE.subject} stories of the last {hot.windowHours} hours
            {hot.computedAt && (
              <>
                {" · "}
                Updated <span className="num">{monthDayTime(hot.computedAt)}</span>
              </>
            )}
          </>
        }
        actions={
          <button type="button" onClick={showMethod} className="flex h-11 items-center gap-1 px-3 text-[14px] text-accent active:opacity-50">
            <IconInfo size={17} /> How it works
          </button>
        }
      />
      <header className="hidden flex-wrap items-end justify-between gap-x-6 gap-y-2 pb-5 pt-1 lg:flex">
        <div>
          <div className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.08em] text-hot">
            <span className="relative flex size-2" aria-hidden="true">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-hot opacity-30" />
              <span className="relative inline-flex size-2 rounded-full bg-hot" />
            </span>
            Live heat
          </div>
          <h1 className="mt-1.5 text-[24px] font-bold leading-[1.3] tracking-[-0.01em] text-ink lg:text-[26px]">{`Trending ${SITE.subject} stories`}</h1>
          <p className="mt-1.5 text-[13.5px] text-ink-3">The {hot.entries.length || 10} most discussed {SITE.subject} stories of the last {hot.windowHours} hours</p>
        </div>
        {hot.computedAt && (
          <p className="text-[12px] text-ink-4">
            Updated <span className="num">{monthDayTime(hot.computedAt)}</span> · sorted by discussion heat
          </p>
        )}
      </header>

      {!lead ? (
        <div className="card rounded-sheet">
          <EmptyState title="Nothing trending yet">No story is being discussed by enough sources yet.</EmptyState>
        </div>
      ) : (
        <>
          <section aria-label="Top three" className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
            <div className="grid grid-cols-1 lg:col-span-7 lg:row-span-2 xl:col-span-8">
              <Lead e={lead} />
            </div>
            {runners.map((e) => (
              <div key={e.story.publicId} className="grid grid-cols-1 lg:col-span-5 xl:col-span-4">
                <Runner e={e} />
              </div>
            ))}
          </section>

          {others.length > 0 && (
            <section aria-label="More trending" className="mt-6 lg:mt-7">
              <div className="mb-3 flex items-baseline justify-between px-1">
                <h2 className="text-[15px] font-semibold text-ink">
                  More <span className="num font-normal text-ink-4">No.{pad(others[0]!.rank)}–{pad(others[others.length - 1]!.rank)}</span>
                </h2>
                <span className="hidden text-[12px] text-ink-4 lg:block">Participants · 24-hour trend · heat index</span>
              </div>
              <ol className="card divide-y divide-line-soft overflow-hidden">
                {others.map((e) => (
                  <Row key={e.story.publicId} e={e} />
                ))}
              </ol>
            </section>
          )}
        </>
      )}

      <details id="hot-method" className="disclosure group/method mt-8 scroll-mt-[calc(var(--bar-h)+16px)] text-[12px] text-ink-4">
        <summary className="flex items-center gap-1.5 py-1 transition-colors hover:text-ink-2">
          <IconInfo size={15} />
          How is heat calculated?
          <span className="ml-auto inline-flex items-center gap-0.5">
            <span className="group-open/method:hidden">About the list</span>
            <span className="hidden group-open/method:inline">Hide</span>
            <IconChevronDown size={13} className="transition-transform duration-200 group-open/method:rotate-180" />
          </span>
        </summary>
        <div className="max-w-[760px] space-y-2 pb-2 pl-[21px] pt-2 leading-[1.75] text-ink-3">
          <p>Heat counts how many accounts and organizations are discussing the same story. Repeat posts by one count once, recent discussion weighs more, and weight halves every 24 hours. It shows how lively the discussion is, not how good the reporting is.</p>
          <p>The list covers only the last 48 hours. Trends compare only the sources we have watched throughout, so they reflect what we can see, not the whole internet; with no comparable history, no trend line is drawn.</p>
          <p>
            The source list shows only reports anyone can read; some accounts and organizations in the discussion are not listed. One organization posting on several platforms counts once, so there can be fewer participants than sources. Open a story to see each side's reports and views.
          </p>
          <dl className="flex flex-wrap gap-x-5 gap-y-1.5 pt-1">
            {Object.values(BADGES).map((b) => (
              <div key={b.label} className="flex items-center gap-1.5">
                <dt>
                  <Badge tone={b.tone}>{b.label}</Badge>
                </dt>
                <dd>{b.hint}</dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
    </div>
  );
}
