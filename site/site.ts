// Site identity and the copy readers see. When moving the site to another industry, start here.
// Both the web app and the backend read it; rebuild (docker compose up --build) after changing it.
// The domain is not set here: set SITE_URL when deploying.

import type { Founder } from "@aihot/contracts/site-config";

/**
 * When the daily, weekly and monthly briefs come out (HH:mm in SITE.timeZone): the daily brief covers the 24 hours
 * before its time, the weekly brief comes out on the Monday after each calendar week, and the monthly brief on the
 * 1st. Scheduling, the brief windows, missed-issue alerts and every sentence that mentions a time read these (files
 * in public/ use {{dailyTime}}, {{weeklyTime}}, {{monthlyTime}}); the scheduler checks every half hour, so use :00 or :30.
 */
export const EDITION_TIMES = { daily: "08:00", weekly: "10:00", monthly: "10:30" };

/** "every day at 08:00 PT": brief times as written in sentences. */
export const EDITION_WHEN = {
  daily: `every day at ${EDITION_TIMES.daily} PT`,
  weekly: `every Monday at ${EDITION_TIMES.weekly} PT`,
  monthly: `on the 1st of each month at ${EDITION_TIMES.monthly} PT`,
};

export const SITE = {
  /** Site name: navigation, page titles, share images, RSS, MCP and the admin all use it. */
  name: "AI Pulse",
  /**
   * Industry word, used in default phrases such as "AI Daily" and "All AI news".
   */
  subject: "AI",
  /** IANA time zone for every date, brief window and schedule on the site. */
  timeZone: "America/Los_Angeles",
  /** Short zone label written after times readers see. */
  timeZoneLabel: "PT",
  /** Full home page title (browser tab, search results). */
  homeTitle: "AI Pulse: the AI news worth reading, picked daily",
  /** Title of the topics directory (/topics). */
  topicsTitle: "AI topics: the latest on labs, models, agents, chips, policy and more",
  /** Example text in the feedback form. */
  feedbackExample: "For example: I searched for a company and expected to see...",
  /** One line under the feedback page title. */
  feedbackLead: "Found a bug, want a feature, or think something reads badly? Tell us.",
  /** Hint in the feedback form email field. */
  feedbackEmailHint: "Leave an email if you would like a reply",
  /** One-line description: search engines, share cards, RSS and llms.txt use it. */
  description: `We read the main AI sources, pick the news worth your time, group reports of the same story, and publish a daily brief ${EDITION_WHEN.daily}.`,
  /** A longer paragraph under the one-line description in llms.txt (optional). */
  llmsIntro: null as string | null,
  /** Small line under share images and posters. */
  tagline: "The AI news worth reading",
  /** Keywords for search engines (home page structured data). */
  keywords: ["AI news", "AI daily brief", "AI industry news", "AI models", "AI labs"] as string[],
  /** Year the site started collecting (structured data, optional). */
  since: null as string | null,
  /** Interface language (HTML lang, og:locale). */
  locale: "en-US",
  /** Default address, used only when SITE_URL is not set. */
  defaultUrl: "http://localhost:3000",
  /** Icons served from the site root besides the standard ones, file names in site/brand/ (optional). */
  rootIcons: [] as string[],
  /**
   * Prefix of MCP tool names (lowercase letters, digits, underscores): aipulse_get_latest, aipulse_search...
   * Do not change it once people have connected.
   */
  mcpPrefix: "aipulse",
  /**
   * Version of the public interfaces (MCP, OpenAPI, llms.txt); only goes up.
   * Raise the major version when an existing field or its meaning changes, and say so in the deploy notes.
   */
  interfaceVersion: "4.0.0",
  /** Public contact email (optional), written into llms.txt and the agent guide. */
  contactEmail: null as string | null,
  /** Small line at the bottom of the about page (optional). */
  footerNote: "Built on the open-source AIHOT framework (MIT)",
  /** Mainland China ICP filing number (optional); not used by this site. */
  icp: null as string | null,
  /** Mainland China public security filing (optional); not used by this site. */
  psb: null as string | null,
  /** GitHub repository of the source (optional); shown in the sidebar and the "Me" page when set. */
  github: null as string | null,
  /** Site operator in structured data (for search engines). */
  organization: {
    name: "AI Pulse",
    /** Founder (optional). */
    founder: null as Founder | null,
  },
  /** Name and version sent when fetching sources (in the User-Agent); never use another site's name. */
  crawlerName: "AIPulseBot/1.0",
} as const;

/** The terms and privacy pages (their text is in pages/). */
export const POLICY = {
  terms: {
    /** Page name: navigation, footer and page title. */
    name: "Terms of use",
    description: "Terms for using this site's pages, RSS feeds, public API and MCP.",
    /** One line about this page in llms.txt (optional). */
    covers: null as string | null,
    /** Reminders shown in the RSS and API panels of the agent page (optional). */
    notes: null as null | { rss: string; api: string },
    /** Which uses need permission first (optional): `llms` for llms.txt, `agent` for the agent guide. */
    license: null as null | { llms: string; agent: string },
    /** Response headers declaring the terms on the public API, RSS and OpenAPI file (optional). */
    headers: null as null | Record<string, string>,
  },
  privacy: {
    description: "How this site handles browser storage, feedback and access logs.",
    /** One line about this page in llms.txt (optional). */
    covers: null as string | null,
  },
  /**
   * Whether the text and images of an X post count as full text: if so, they show only when the post may be shown
   * in full on the site; if not, they always show, like a title and summary.
   */
  xPostIsFullText: true,
} as const;

/** Navigation (desktop sidebar, phone tab bar, "Me" page). */
export const NAV = {
  /** Engine pages left out of navigation; only "/hot" and "/topics" are supported. */
  hidden: [] as Array<"/hot" | "/topics">,
};

/** Wording and display on item cards and item pages. */
export const ITEM_COPY = {
  /** What the model's one-line reason is called: cards, item pages, Markdown export, agent answers and pushes. */
  reasonLabel: "Why it matters",
  /** Whether readers see the AI score on pages and share images. Display only: the API and MCP still carry it. */
  showScore: true,
};

/** One QR card on the about page. */
interface ContactCard {
  kind: string;
  title: string;
  note: string;
  /** A root file name linked from elsewhere (optional), such as qr-wechat.jpg: it always redirects to the current code. */
  alias?: string;
}

/** About page copy. The numbers (sources, items, picks, briefs) come from live counts, not from here. */
export const ABOUT = {
  kicker: `About ${SITE.name}`,
  /** Page description (search results, share cards). */
  description: `About ${SITE.name}: ${SITE.description}`,
  /** Headline: first line in the normal color, second in the accent color. */
  headline: ["Something happens in AI every day.", "Only a few things are worth your time."] as [string, string],
  /** Paragraph under the headline. {sources} becomes the live source count; sourcesFallback is used when the count is missing. */
  lead: `${SITE.name} watches {sources} sources for you: it collects, groups, scores and picks, then publishes a daily brief ${EDITION_WHEN.daily}. Free, no sign-up.`,
  sourcesFallback: "dozens of",
  /** The four steps under the source animation. */
  steps: {
    collect: "We follow official blogs, news sites and newsletters. Busier sources are checked more often, as often as every 15 minutes.",
    store: "Everything collected is kept, and reports of the same story are grouped together. The trending list is built from these groups.",
    select: `A model first checks that a piece is about AI and has real news in it, then writes a plain title, a short summary and ${ITEM_COPY.reasonLabel.toLowerCase()}. Marketing and reposts do not get in.`,
    publish: `A daily brief ${EDITION_WHEN.daily}, a weekly brief ${EDITION_WHEN.weekly}, and a monthly brief ${EDITION_WHEN.monthly}.`,
  },
  /**
   * Author block (optional); null hides it.
   * avatarSourceId: id of an X account source whose avatar is used (optional).
   */
  maker: null as null | {
    name: string;
    avatarSourceId?: string | null;
    greeting: string[];
    wechat?: ContactCard;
    feishu?: ContactCard;
  },
  /** Copyright and takedown note at the bottom, with a link to the feedback page in between. */
  copyright: [`${SITE.name} is a summary and reading index. Original articles belong to their publishers. If you publish one of our sources and want a correction, a takedown or a different display, please use the`, "to contact us."] as [string, string],
  /** Credit for the open-source framework this site is built on, shown on the about page. */
  credit: {
    text: "AI Pulse is built on AIHOT, an open-source AI news engine released under the MIT License by its author, Digital Life Khazix (数字生命卡兹克). AI Pulse is an independent site and is not affiliated with AIHOT.",
    url: "https://github.com/KKKKhazix/AIHOT",
    label: "AIHOT on GitHub",
  },
  /** Anchor id of the terms link at the bottom (optional); keep it once external documents link to it. */
  termsAnchor: null as string | null,
} as const;

/** Hints for admins on admin pages (optional). */
export const ADMIN = {
  /** One line under the feedback page title. */
  feedbackNote: null as string | null,
  /** Extra sentence in the confirm dialog when banning a feedback sender. */
  banNote: null as string | null,
  /** Extra sentence in the confirm dialog when changing a paid service limit. */
  budgetNote: null as string | null,
};

/** Examples on the agent page. */
export const AGENT = {
  /** The "search" row of the MCP tool table: what it searches and an example question. */
  search: { scope: "Search the last 7 days by company, product, person or topic", ask: "What has this company announced lately?" },
};

/** Wording in the daily, weekly and monthly briefs. */
export const REPORTS = {
  /** Publisher line under the nameplate. */
  imprint: SITE.name.toUpperCase(),
  /** One word next to the nameplate. */
  motto: SITE.subject as string,
  /** Page descriptions of each brief (search results, share cards), no final period; llms.txt uses them too. */
  descriptions: {
    daily: `The ${SITE.name} daily brief, published ${EDITION_WHEN.daily}`,
    weekly: `A weekly review of the ${SITE.subject} news that mattered`,
    monthly: `A monthly round-up of ${SITE.subject} news`,
  },
  /**
   * What one entry of a brief is called ("4 top stories"): the title when there is no lead story, counts on the
   * nameplate and archive, the line in weekly and monthly briefs without an overview, and the feed descriptions.
   */
  entry: { measure: "", noun: "top stories" },
  /** Units after the other numbers on the nameplate; the about and topic pages write counts the same way. */
  metricUnits: { sourcesCount: "sources", firstPartyEvents: "official announcements", selectedCount: "picks", reportsCovered: "daily briefs" },
  /** "N top stories" on brief share images. */
  shareUnit: "top stories",
  /** Title and lead when items were reviewed in the daily window but nothing big happened. */
  quiet: { title: "A quiet day: nothing big happened", paragraph: `No new top ${SITE.subject} stories between {start} and {end} ${SITE.timeZoneLabel}.` },
};

/** Wording in operations alerts (sent only to the site owner) that depends on the deployment. */
export const ALERTS = {
  /** Minutes without a new article before the "collection stopped" alert (at most a day); ALERT_QUIET_MINUTES wins. */
  quietMinutes: 360,
  /** A sentence on the usual volume added to that alert; null leaves it out. */
  usualFlow: null as string | null,
  /** How to read the worker's logs, in the worker-down alert. */
  workerLogs: "check the worker logs (docker compose logs worker)",
};

/** Defaults when an admin creates a source. */
export const SOURCE_DEFAULTS = {
  /** Show full text on the site; false shows only the summary and a link to the original. */
  siteFulltext: false,
};

/**
 * Community feeds (source ids) whose heat is counted per posting account, one account per independent source,
 * instead of the whole feed counting once. dev is the dev.to article stream, hn the Hacker News stream.
 */
export const COMMUNITY_FEEDS: { dev: string[]; hn: string[] } = {
  dev: [],
  hn: ["hn-ai"],
};

/** Text on each page's share image (/og/pages/*.png). The topics directory image is generated from the topic count. */
export const CARDS: Record<string, { kicker: string; title: string; subtitle: string; accent?: "hot" | "amber" }> = {
  site: { kicker: "Daily AI picks", title: SITE.tagline, subtitle: SITE.description },
  all: { kicker: "All AI news", title: "Every source's latest news in one place", subtitle: "The latest from every source, newest first. Filter by category and tag." },
  hot: { kicker: "Trending", title: "What people are talking about in the last 48 hours", subtitle: "Heat index, trend, and the public sources behind it.", accent: "hot" },
  daily: { kicker: withSubject("Daily"), title: `A daily ${SITE.subject} brief you can finish, every morning at ${spokenTime(EDITION_TIMES.daily)}`, subtitle: `The ${SITE.subject} news worth knowing from the past day.` },
  weekly: { kicker: withSubject("Weekly"), title: "The week's top stories at a glance", subtitle: "This week's main threads, key launches and discussions worth a second look." },
  monthly: { kicker: withSubject("Monthly"), title: "How the month changed things", subtitle: "The month's main threads and key events." },
  about: { kicker: "About", title: `About ${SITE.name}`, subtitle: SITE.description },
  terms: { kicker: "Terms", title: `${SITE.name} terms of use`, subtitle: "How the pages, API, RSS and MCP may be used." },
  privacy: { kicker: "Privacy", title: `${SITE.name} privacy notice`, subtitle: "How access logs, browser storage and feedback are handled." },
  changelog: { kicker: "Changelog", title: `${SITE.name} changelog`, subtitle: "New features, improvements, announcements and retirements." },
  feedback: { kicker: "Feedback", title: "Tell us what could be better", subtitle: "Content, features, integrations, or corrections and takedowns from publishers." },
  agent: { kicker: "For agents", title: `Connect ${SITE.name} to your agent`, subtitle: "MCP, RSS or API. Anonymous, read-only, no API key needed." },
};

/** Parts of the public access terms that depend on the deployment, written into the agent guide and llms.txt. */
export const ACCESS = {
  /** Roughly how many requests per minute one IP may make before a 429 with Retry-After (optional, enforced by the reverse proxy). */
  ratePerMinute: null as number | null,
  /** User-Agent that people syncing data should send (optional). */
  userAgent: null as string | null,
};

/** Arrangements of this deployment (all optional). */
export const DEPLOYMENT = {
  /** Default folder of credential group files (models.env, collectors.env...), relative to the repo root; AIHOT_CREDENTIALS_DIR wins. */
  credentialsDir: null as string | null,
  /** File names of credential groups in that folder (optional); a group not listed uses "<group>.env". */
  credentialFiles: {} as Partial<Record<string, string>>,
  /** Extra credentials ([group, variable]) the production API checks at startup; none by default. */
  requiredSecrets: [] as const,
  /** Host the production API receives (the CDN origin name, optional); the dev web server rewrites to it too. */
  originHost: null as string | null,
  /** Header the reverse proxy uses to carry the original address when sending a signed-out admin to login (optional). */
  loginReturnHeader: null as string | null,
  /**
   * Upstream traffic cap of the image proxy: past it, uncached images return 503 until the minute or day passes.
   * null means no cap. IMGPROXY_UPSTREAM_MB_PER_MINUTE and IMGPROXY_UPSTREAM_GB_PER_DAY win.
   */
  imageUpstreamBudget: null as null | { mbPerMinute: number; gbPerDay: number },
  /**
   * Hosts fetched directly rather than through EGRESS_PROXY_URL, for collection and images (optional).
   * Each redirect picks its route again by host; direct connections still check the address connected to.
   */
  directFetchHosts: [] as string[],
  /**
   * Gold set used by scripts/eval-selection.ts without arguments: file (from the repo root), sample size, split and
   * threshold sweep. null uses all of .data/gold.jsonl (at most 200) and sweeps 40 to 90.
   */
  selectionGold: null as null | { file: string; sample: number; split: string; sweep: [number, number] },
};

/** Site-specific wording in RSS feed descriptions. */
export const FEED_COPY = {
  /** What the "all news" feed leaves out, besides unreviewed, off-topic and merged duplicate items (optional). */
  allLeavesOut: [] as string[],
};

/**
 * Categories that differ in the public API, RSS and MCP from the web pages (optional). Keep them once live: the
 * keys appear in API parameters and feed addresses.
 * merge: a category published as another (key is the industry category, value the one it merges into);
 * feedLabels: names in category RSS titles, replacing the industry's feedLabel.
 */
export const PUBLIC_CATEGORIES = {
  merge: {},
  feedLabels: {},
} as const;

/** "AI Daily", "AI Weekly": the industry word before a noun. */
export function withSubject(noun: string): string {
  return `${SITE.subject} ${noun}`;
}

/** "Browse AI by topic", "Past AI Daily": text, then the industry word (and noun, as in withSubject). */
export function subjectAfter(text: string, noun?: string): string {
  return `${text} ${noun ? withSubject(noun) : SITE.subject}`;
}

/** "8 AM", "10:30 AM": HH:mm as spoken. */
function spokenTime(time: string): string {
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${hour < 12 ? "AM" : "PM"}`;
}
