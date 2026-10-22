import { siteDate } from "@aihot/contracts/time";
import { describePublicationTime } from "../sources/dates.ts";
// The writing side of the analysis: the prefilter's and the content understanding's inputs, the
// title/summary prompts for everything else, the output parsing and the deterministic guards. The
// wording lives in the industry pack (industry/prompts/); a failed guard falls back without a repair call.
import { IDENTITY_CONTEXT_ALIASES, IDENTITY_LEXICON, PUBLISHER_DOMAINS } from "@aihot/industry/taxonomy";
import { stripTagMarkup, isEnglishText as looksEnglish } from "../lib/text.ts";
export { isEnglishText as looksEnglish } from "../lib/text.ts";
import { onlyXArticleLink } from "../sources/x.ts";
import type { AnalyzeInputArticle } from "./input.ts";
import { promptText } from "./prompts.ts";

export const PREFILTER_SYSTEM = promptText("prefilter");
export const UNDERSTAND_SYSTEM = promptText("understand");

/** A body longer than this is cut (whole bodies are sent; a few run past the context). */
export const MAX_BODY_CHARS = 60_000;
const capBody = (s: string) => (s.length > MAX_BODY_CHARS ? s.slice(0, MAX_BODY_CHARS) : s);

// Text helpers

export function clampText(s: string, maxChars: number): string {
  const codepoints = Array.from(s);
  return codepoints.length <= maxChars ? s : codepoints.slice(0, maxChars).join("") + "…";
}

/** Short tweet: under 100 characters of Chinese, under 500 of other text. */
export function isShortTweet(text: string): boolean {
  if (!text) return false;
  const cjk = (text.match(/[一-鿿]/g) || []).length;
  return text.length < (cjk > text.length * 0.3 ? 100 : 500);
}

/** HTML, URLs (whose /2025/ paths models took for years) and entities out of article text. */
export function cleanArticleTextForLLM(s: string): string {
  if (!s) return "";
  return stripTagMarkup(s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " "))
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const stripNoise = (s: string) => s.replace(/https?:\/\/\S+/g, " ").replace(/@[A-Za-z0-9_]+/g, " ").replace(/#[A-Za-z0-9_]+/g, " ");

/** A short post in English is its own copy; one in another language needs writing up. */
export function needsShortTweetTranslation(text: string): boolean {
  return !looksEnglish(stripNoise(text));
}

// The material as the prefilter and the content understanding read it

/** The post is an X Article's link whose article could not be fetched. */
const unfetchedXArticle = (a: AnalyzeInputArticle) => !!a.xPost && a.bodyStatus !== "ok" && onlyXArticleLink(String(a.xPost.text ?? ""));

function materialQuality(a: AnalyzeInputArticle): string {
  if (a.xPost) return "full body (from the RSS or API content field)";
  if (a.bodyText) return a.source.fetchesBody ? "full body (fetched from the original page)" : "full body (from the RSS or API content field)";
  if (a.excerpt) return "summary only (the feed has no full body)";
  if (a.bodyStatus === "unconfirmed") return "fetch failed, title only";
  return "no usable text";
}

/** The material as the prefilter and the content understanding read it. */
export function renderContext(a: AnalyzeInputArticle, opts: { annotateQuoted?: boolean } = {}): string {
  const lines: string[] = [];
  lines.push(`[Source] ${a.source.name} (${a.source.kind}, tier=${a.source.tier || "unrated"})`);
  if (a.source.tags?.length) lines.push(`[Source tags] ${a.source.tags.join(", ")}`);
  const name = a.xPost?.authorName || a.author;
  const handle = a.xPost?.handle;
  if (name || handle) lines.push(`[Author] ${[name, handle ? `@${handle}` : null].filter(Boolean).join(" · ")}`);
  if (a.publishedAt) lines.push(`[Published] ${describePublicationTime(a.publishedAt, a.publicationTime)}`);
  const media = (a.xPost?.media ?? a.media ?? []) as Array<{ kind?: string }>;
  const images = media.filter((m) => m.kind === "image").length;
  const videos = media.filter((m) => m.kind === "video").length;
  const mediaParts = [images ? `${images} image(s)` : null, videos ? `${videos} video(s)` : null, unfetchedXArticle(a) ? "has an X Article link (its text was not fetched)" : null].filter(Boolean);
  if (mediaParts.length) lines.push(`[Media] ${mediaParts.join(" · ")}`);
  lines.push(`[Original link] ${a.url}`);
  lines.push(`[Title] ${a.title}`);
  const quoted = a.xPost?.quoted?.text ? a.xPost.quoted : null;
  if (quoted) {
    const label = quoted.handle ? `@${quoted.handle}` : "original post";
    if (opts.annotateQuoted) {
      lines.push(`[Quoting ${label}] (what follows is **someone else's** content the author reposted or quoted, not the author's own)`);
      lines.push(String(quoted.text));
    } else {
      lines.push(`[Quoting ${label}] ${quoted.text}`);
    }
  }
  lines.push("");
  lines.push(opts.annotateQuoted && quoted ? "[Body (the author's own content)]" : "[Body]");
  lines.push(capBody(a.xPost ? String(a.xPost.text ?? a.title) : (a.bodyText ?? a.excerpt ?? "(no body)")));
  lines.push("");
  lines.push(`[Material quality] ${materialQuality(a)}`);
  return lines.join("\n");
}

/** The prefilter's user message: the context as a JSON string (the prompt was tuned on this form). */
export const prefilterUser = (a: AnalyzeInputArticle) => JSON.stringify(renderContext(a));

/** No text beyond the title: no body, feed excerpt, post or quoted text. */
export function missingEvidence(a: AnalyzeInputArticle): boolean {
  return !a.bodyText?.trim() && !a.excerpt?.trim() && !String(a.xPost?.text ?? "").trim() && !String(a.xPost?.quoted?.text ?? "").trim();
}

export const understandUser = (a: AnalyzeInputArticle) =>
  ["Understand the single item below by the system rules and return all six fields at once.", renderContext(a, { annotateQuoted: true })].join("\n\n");

// Identity context and guard

const lexiconName = (id: string) => IDENTITY_LEXICON.find((e) => e.id === id)?.name ?? null;

/** Known companies the texts name, by the pack's identity lexicon (each text on its own). */
export function matchEntityIds(texts: Array<string | null | undefined>): string[] {
  const list = texts.filter((t): t is string => typeof t === "string" && t.trim().length > 0);
  return IDENTITY_LEXICON.filter((e) => e.patterns.some((p) => list.some((t) => p.test(t)))).map((e) => e.id);
}

/** A translation may rejoin a name (GPT 5.5 → GPT-5.5): the input counts in both spellings. */
const surfaceVariants = (texts: Array<string | undefined>) => {
  const exact = texts.filter((t): t is string => typeof t === "string" && t.trim().length > 0);
  return [...exact, ...exact.map((t) => t.replace(/\b(gpt|glm)\s+(?=[o\d])/gi, "$1-"))];
};

function publisherEntityId(url?: string): string | null {
  let host: string;
  try {
    host = new URL(url ?? "").hostname.toLowerCase();
  } catch {
    return null;
  }
  return PUBLISHER_DOMAINS.find((e) => e.domains.some((d) => host === d || host.endsWith(`.${d}`)))?.entityId ?? null;
}

export interface TranslateInput {
  title: string;
  text: string;
  sourceKind: string;
  sourceName?: string;
  documentUrl?: string;
  sourceOwnerEntityId?: string | null;
  /** The main post of a tweet (not the quoted one), for the short/long decision. */
  mainText?: string;
  quotedText?: string;
  quotedAuthor?: string;
  publishedAt?: Date;
  publicationTime?: string | null;
}

export function translateInputOf(a: AnalyzeInputArticle): TranslateInput {
  const isX = a.source.kind === "x_search" || !!a.xPost;
  const mainText = isX ? String(a.xPost?.text ?? a.title) : undefined;
  return {
    title: a.title,
    text: isX ? (mainText ?? "") : (a.bodyText ?? a.excerpt ?? ""),
    sourceKind: isX ? "x_search" : a.source.kind,
    sourceName: a.source.name,
    documentUrl: a.url,
    sourceOwnerEntityId: a.source.ownerEntityId ?? null,
    mainText,
    quotedText: a.xPost?.quoted?.text ? String(a.xPost.quoted.text) : undefined,
    quotedAuthor: a.xPost?.quoted?.handle ? String(a.xPost.quoted.handle) : undefined,
    publishedAt: a.publishedAt ?? undefined,
    publicationTime: a.publicationTime,
  };
}

function identityContext(input: TranslateInput) {
  const publisher = publisherEntityId(input.documentUrl);
  const owner = input.sourceOwnerEntityId && lexiconName(input.sourceOwnerEntityId) ? input.sourceOwnerEntityId : null;
  const texts = [input.title, input.text, input.mainText, input.quotedText, input.sourceName];
  const allowed = new Set(matchEntityIds(surfaceVariants(texts)));
  const joined = texts.filter(Boolean).join("\n");
  for (const alias of IDENTITY_CONTEXT_ALIASES) if (alias.pattern.test(joined)) allowed.add(alias.entityId);
  if (publisher) allowed.add(publisher);
  if (owner) allowed.add(owner);
  return { allowed: [...allowed].sort(), publisher, owner };
}

function identityPrompt(input: TranslateInput): string {
  const ctx = identityContext(input);
  const facts: string[] = [];
  if (ctx.publisher) facts.push(`publisher of the document domain=${lexiconName(ctx.publisher) ?? ctx.publisher}`);
  if (ctx.owner) facts.push(`owner of the source account=${lexiconName(ctx.owner) ?? ctx.owner}`);
  return promptText("identity-context", { facts: facts.length > 0 ? facts.join("; ") : "no clear publisher identified" });
}

export interface IdentityGuard {
  outcome: "pass" | "fallback";
  unsupportedTitleEntityIds: string[];
  unsupportedSummaryEntityIds: string[];
}

/**
 * A model only words the copy; it cannot introduce a company the input does not name. A title that
 * does falls back to the original Chinese title (or nothing), a summary that does is dropped.
 */
export function enforceIdentity(input: TranslateInput, copy: { titleZh: string; summaryZh: string }) {
  const allowed = new Set(identityContext(input).allowed);
  const unsupportedTitleEntityIds = matchEntityIds([copy.titleZh]).filter((id) => !allowed.has(id));
  const unsupportedSummaryEntityIds = matchEntityIds([copy.summaryZh]).filter((id) => !allowed.has(id));
  return {
    titleZh: unsupportedTitleEntityIds.length ? (looksEnglish(input.title) ? input.title : "") : copy.titleZh,
    summaryZh: unsupportedSummaryEntityIds.length ? "" : copy.summaryZh,
    identityGuard: {
      outcome: unsupportedTitleEntityIds.length || unsupportedSummaryEntityIds.length ? "fallback" : "pass",
      unsupportedTitleEntityIds,
      unsupportedSummaryEntityIds,
    } as IdentityGuard,
  };
}

// Answer-first summary length

/** Sentences of English text: a stop, question or exclamation mark followed by a space ends one ("3.5" does not). */
const sentencesOf = (text: string) => text.split(/(?<=[.!?]["'”’)]?)\s+/u).map((s) => s.trim()).filter(Boolean);

/** Summary lengths in characters: 40 to 80 English words, a rich source's at least two sentences. */
const SUMMARY_CHARS = { max: 560, min: 120, richMin: 200, compactTo: 520, enough: 260 } as const;

export function compactAnswerFirstSummary(summary: string, maxChars: number = SUMMARY_CHARS.compactTo): string {
  const text = summary.trim().replace(/\s*\n+\s*/g, " ");
  if (text.length <= maxChars) return text;
  let result = "";
  for (const sentence of sentencesOf(text)) {
    const next = result ? `${result} ${sentence}` : sentence;
    if (next.length > maxChars) break;
    result = next;
    if (result.length >= SUMMARY_CHARS.enough) break;
  }
  // Whole sentences, even a short one, read better than half of the next.
  if (result) return result;
  // The first sentence alone is too long: cut at a clause boundary, never inside a name, number or enumeration.
  const clauses = text.match(/[^,;]+[,;]?/gu) ?? [text];
  for (const clause of clauses) {
    if ((result + clause).length + 1 > maxChars) break;
    result += clause;
    if (result.length >= SUMMARY_CHARS.enough) break;
  }
  return result.length >= SUMMARY_CHARS.min ? `${result.trim().replace(/[,;]$/u, "")}.` : text;
}

function answerFirstSummaryLengthOk(summary: string, input: TranslateInput): boolean {
  const trimmed = summary.trim();
  const sourceLength = (input.sourceKind === "x_search" ? input.text : cleanArticleTextForLLM(input.text)).trim().length;
  const sentences = sentencesOf(trimmed).length;
  const rich = sourceLength >= 1500;
  return trimmed.length <= SUMMARY_CHARS.max && trimmed.length >= (rich ? SUMMARY_CHARS.richMin : SUMMARY_CHARS.min) && sentences <= 3 && (!rich || sentences >= 2);
}

export const isShortTweetInput = (input: TranslateInput) => input.sourceKind === "x_search" && isShortTweet(input.mainText || input.title);

/** The length rule (compacted without another call) and the identity guard, for any writing model. */
export function finalizeCopy(input: TranslateInput, copy: { titleZh: string; summaryZh: string }) {
  let summaryZh = copy.summaryZh;
  if (!isShortTweetInput(input) && summaryZh && !answerFirstSummaryLengthOk(summaryZh, input)) summaryZh = compactAnswerFirstSummary(summaryZh);
  return enforceIdentity(input, { titleZh: copy.titleZh, summaryZh });
}

// Title/summary prompts for items the content understanding does not write

const sourceName = (name?: string) => name?.trim() || "(not stated)";

function anchorDate(d: Date | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return "not stated";
  return siteDate(d);
}

export function buildArticlePrompt(input: TranslateInput): string {
  return promptText("summarize-article", {
    publishedDate: input.publicationTime?.length === 10 ? input.publicationTime : anchorDate(input.publishedAt),
    today: anchorDate(new Date()),
    sourceName: sourceName(input.sourceName),
    identity: identityPrompt(input),
    title: input.title,
    body: input.text ? clampText(cleanArticleTextForLLM(input.text), 6000) : promptText("summarize-article-empty"),
  });
}

/** The quoted post's block, appended after a blank line when there is one. */
function quotedBlock(input: TranslateInput, name: string): string {
  if (!input.quotedText) return "";
  return `\n\n${promptText(name, { quotedLabel: input.quotedAuthor ? `Quoted post by @${input.quotedAuthor}` : "Quoted post", quotedText: clampText(input.quotedText, 1500) })}`;
}

export function buildShortTweetPrompt(input: TranslateInput): string {
  const post = clampText(input.mainText || input.text || input.title, 4000);
  return promptText("summarize-short-post", { sourceName: sourceName(input.sourceName), identity: identityPrompt(input), post }) + quotedBlock(input, "summarize-short-post-quoted");
}

export function buildLongTweetPrompt(input: TranslateInput): string {
  const post = clampText(input.mainText || input.text || input.title, 4000);
  return promptText("summarize-long-post", { sourceName: sourceName(input.sourceName), identity: identityPrompt(input), post }) + quotedBlock(input, "summarize-long-post-quoted");
}

/** Prompt lines a model sometimes repeats after its answer (Source: …, [Verified identity context] …, Original title: …). */
const ECHO_LINE = /^(Source:|\[Verified identity context\]|These facts only prevent|Original title:|\[Time anchor\])/;

/** The answer without prompt lines repeated at its end. */
export function stripEcho(text: string): string {
  const lines = text.split("\n");
  while (lines.length && (lines[lines.length - 1]!.trim() === "" || ECHO_LINE.test(lines[lines.length - 1]!.trim()))) lines.pop();
  return lines.join("\n").trim();
}

/** `title_zh:` / `summary_zh:` / `body_zh:` lines, with fallbacks for answers that drop the labels. */
export function parseTranslateOutput(text: string): { titleZh: string; summaryZh: string; bodyZh: string } {
  let titleZh = "";
  let summaryZh = "";
  let bodyZh = "";
  let titleLine = -1;
  let summaryLine = -1;
  let bodyLine = -1;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i]!.trim();
    const title = t.match(/^title_zh\s*[:：]\s*(.*)$/);
    if (title) { titleZh = title[1]!.trim(); titleLine = i; continue; }
    const summary = t.match(/^summary_zh\s*[:：]\s*(.*)$/);
    if (summary) { summaryZh = summary[1]!.trim(); summaryLine = i; continue; }
    const body = t.match(/^body_zh\s*[:：]\s*(.*)$/);
    if (body) { bodyZh = body[1]!.trim(); bodyLine = i; continue; }
  }
  // A title without a labelled summary or body: the lines after it are the summary.
  if (titleZh && !summaryZh && bodyLine < 0 && titleLine >= 0) {
    const rest = lines.slice(titleLine + 1).map((l) => l.trim()).filter(Boolean);
    if (rest.length) summaryZh = rest.join("\n");
  }
  // A summary split over lines: join the unlabelled lines after it.
  if (summaryLine >= 0) {
    const more: string[] = [];
    for (let i = summaryLine + 1; i < lines.length; i += 1) {
      const t = lines[i]!.trim();
      if (!t) continue;
      if (/^(title_zh|summary_zh|body_zh)\s*[:：]/.test(t)) break;
      more.push(t);
    }
    const parts = [summaryZh, ...more].filter(Boolean);
    if (parts.length) summaryZh = parts.join("\n");
  }
  // A body over lines keeps its paragraph breaks.
  if (bodyLine >= 0) {
    const more: string[] = [];
    for (let i = bodyLine + 1; i < lines.length; i += 1) {
      if (/^(title_zh|summary_zh|body_zh)\s*[:：]/.test(lines[i]!.trim())) break;
      more.push(lines[i]!);
    }
    while (more.length && more[more.length - 1]!.trim() === "") more.pop();
    const parts = bodyZh ? [bodyZh, ...more] : more;
    if (parts.length) bodyZh = parts.join("\n");
  }
  if (!titleZh && !summaryZh && !bodyZh) {
    const rest = text.trim().split(/\r?\n/).filter(Boolean);
    if (rest.length >= 2) {
      titleZh = rest[0]!.trim();
      summaryZh = rest.slice(1).join("\n").trim();
    } else if (rest.length === 1) {
      titleZh = rest[0]!.trim();
    }
  }
  return { titleZh, summaryZh: stripEcho(summaryZh), bodyZh: stripEcho(bodyZh) };
}
