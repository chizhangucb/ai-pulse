// Model per capability: the code default (the site's choice in site/models.ts, else `default`, the deployment's
// own model), an environment override, and an admin switch kept in settings (every switch is audited). A name
// no model registers stops the api and worker at startup (assertModelChoices) rather than running another model.
// Read at call time and cached for a minute, so a switch applies to the next call without a restart; a
// changed model only affects work done from then on (history is not re-judged).
import { READER_WORDING } from "@aihot/industry/wording";
import { DEFAULTS } from "@aihot/site/models";
import { sql } from "../db.ts";
import { serverModules } from "../modules.ts";
import { MODELS } from "../providers/llm.ts";

export interface Capability {
  /** The step's name on the admin page, with an explanation in full-width brackets if it needs one; alerts use the name alone. */
  label: string;
  env: string;
  default: string;
  /** Receipt purposes this capability produces (for the admin statistics). */
  purposes: string[];
  /** The step needs a model that reads images. */
  vision?: boolean;
  /** The step has nothing to do on this site, so a service's outage does not stop it. */
  idle?: () => boolean;
}

export const CAPABILITIES = {
  prefilter: { label: "Pick prefilter (is it about this industry, broad recall)", env: "PREFILTER_MODEL", default: DEFAULTS.prefilter ?? "default", purposes: ["prefilter_article"] },
  score: { label: "Pick scoring (two independent scores, per source tier threshold)", env: "SCORE_MODEL", default: DEFAULTS.score ?? "default", purposes: ["score_article"] },
  understand: { label: "Content understanding (title, summary and reason for picks and near-picks; reads the first image when it can)", env: "UNDERSTAND_MODEL", default: DEFAULTS.understand ?? "default", purposes: ["understand_article"] },
  summarize: { label: "Title and summary (English title and summary for other items)", env: "SUMMARIZE_MODEL", default: DEFAULTS.summarize ?? "default", purposes: ["summarize_article"] },
  wording: { label: "Wording fixes (only the words this site does not use, in titles, summaries and reasons)", env: "WORDING_MODEL", default: DEFAULTS.wording ?? "default", purposes: ["mend_wording"], idle: () => !READER_WORDING.length },
  structure: { label: "Structuring (category, tags, subject companies, event facts; no reader text)", env: "STRUCTURE_MODEL", default: DEFAULTS.structure ?? "default", purposes: ["structure_article"] },
  group: { label: "Event grouping (a new report vs candidate facts: same happening, a development of the same story, or unrelated; whether two stories linked by one report are one story)", env: "GROUP_MODEL", default: DEFAULTS.group ?? "default", purposes: ["group_article", "group_signal", "group_story"] },
  groupReview: { label: "Grouping review (merges with low similarity and merges of two stories are read again before writing; best with another vendor's model)", env: "GROUP_REVIEW_MODEL", default: DEFAULTS.groupReview ?? "default", purposes: ["group_review", "group_story_review"] },
  digest: { label: "Story overview", env: "DIGEST_MODEL", default: DEFAULTS.digest ?? "default", purposes: ["story_digest"] },
  // Dailies are computed by rule; report_lead and report_daily remain for their older receipts.
  report: { label: "Weekly and monthly overviews and themes (the daily brief is built by rules, no model)", env: "REPORT_MODEL", default: DEFAULTS.report ?? "default", purposes: ["report_weekly", "report_monthly", "report_lead", "report_daily"] },
  translate: { label: "Translation of non-English picks (including quoted posts)", env: "TRANSLATE_MODEL", default: DEFAULTS.translate ?? "default", purposes: ["translate_body", "translate_quoted"] },
} satisfies Record<string, Capability>;

export type CapabilityKey = keyof typeof CAPABILITIES;

/** Every step: the engine's, then the installed modules' (their defaults also from site/models.ts). */
export function capabilities(): Record<string, Capability> {
  const all: Record<string, Capability> = { ...CAPABILITIES };
  for (const m of serverModules()) for (const [key, step] of Object.entries(m.models ?? {})) all[key] = { ...step, default: DEFAULTS[key] ?? "default" };
  return all;
}

/** Names of the active steps currently routed to a service, using the same choices as model calls. */
export async function stepsOnService(service: string, models?: ReadonlySet<string>): Promise<string[]> {
  const current = await modelSources();
  return Object.entries(capabilities())
    .filter(([key, c]) => {
      if (c.idle?.()) return false;
      const primary = current[key]!.model;
      return [primary, fallbackModelFor(key, primary)].some(key => {
        const model = key && MODELS[key];
        return model && model.service === service && (!models || models.has(model.model));
      });
    })
    .map(([, c]) => c.label.split(" (")[0]!);
}

let cache: { at: number; overrides: Record<string, string> } | null = null;

async function overrides(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < 60_000) return cache.overrides;
  const rows = await sql<{ key: string; value: { model?: string } }[]>`SELECT key, value FROM settings WHERE key LIKE 'models.%'`;
  const map: Record<string, string> = {};
  for (const r of rows) if (r.value?.model && MODELS[r.value.model]) map[r.key.slice("models.".length)] = r.value.model;
  cache = { at: Date.now(), overrides: map };
  return map;
}

export function invalidateModelCache() {
  cache = null;
}

/** Whether a registered model explicitly declares image input support. Unspecified means text-only. */
export function modelSupportsVision(model: string): boolean {
  return MODELS[model]?.vision === true;
}

/** Whether a step can use a registered model. A model that reads images writes text as well. */
export function capabilityAcceptsModel(capability: Capability, model: { vision?: boolean }): boolean {
  return !capability.vision || model.vision === true;
}

/** A step's environment choice; an empty value counts as unset. */
function envChoice(c: Capability): string | undefined {
  return process.env[c.env] || undefined;
}

function unknownModel(where: string, model: string): string | undefined {
  return MODELS[model] ? undefined : `Unknown model in ${where}=${model}; use default or a preset name from site/models.ts`;
}

/** Throws one error naming every step whose environment choice or site default is not a registered model. */
export function assertModelChoices(): void {
  const problems = Object.entries(capabilities()).flatMap(([key, c]) => {
    const env = envChoice(c);
    return [env && unknownModel(c.env, env), unknownModel(`DEFAULTS.${key}`, c.default)].filter((p): p is string => !!p);
  });
  if (problems.length) throw new Error(problems.join("\n"));
}

/** The model a capability uses now: admin switch, else environment, else the code default. */
export async function modelFor(capability: CapabilityKey | (string & {})): Promise<string> {
  const c = capabilities()[capability];
  if (!c) throw new Error(`unknown model step: ${capability}`);
  const admin = (await overrides())[capability];
  if (admin) return admin;
  const env = envChoice(c);
  const problem = env ? unknownModel(c.env, env) : unknownModel(`DEFAULTS.${capability}`, c.default);
  if (problem) throw new Error(problem);
  return env ?? c.default;
}

/** Where the current choice comes from, for the admin page. */
export async function modelSources(): Promise<Record<string, { model: string; source: "admin" | "env" | "default" }>> {
  const o = await overrides();
  const out: Record<string, { model: string; source: "admin" | "env" | "default" }> = {};
  for (const [key, c] of Object.entries(capabilities())) {
    const env = envChoice(c);
    if (o[key]) out[key] = { model: o[key]!, source: "admin" };
    else if (env) out[key] = { model: env, source: "env" };
    else out[key] = { model: c.default, source: "default" };
  }
  return out;
}

export function fallbackModelFor(capability: string, primary: string): string | undefined {
  return Object.values(MODELS).find(model => model.fallbackFor?.[capability] === primary && model.service !== MODELS[primary]!.service)?.key;
}

/** Preserve an explicit primary choice; only the site's evaluated pair may fail over. */
export async function modelRoute(capability: CapabilityKey | (string & {})): Promise<{ model: string; fallbackModel?: string }> {
  const model = await modelFor(capability);
  return { model, fallbackModel: fallbackModelFor(capability, model) };
}
