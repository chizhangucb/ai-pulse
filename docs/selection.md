# Selection and calibration

## How an item becomes a pick

1. **Collected.** One copy is kept per address and per content. When an ordinary article has only a title or a summary, its body is fetched by the source's rules; a video page uses the text it provides, never the player page as a body. Material without a trustworthy publication time is not made public until the original's date is read and its age can be judged (see "Old articles don't flood the site" in [Sources](sources.md#rule-old-articles-dont-flood-the-site)).
2. **Pre-screen** (`prefilter.md`). Is this about the industry? The gate is wide and stops only what is clearly unrelated: `BLOCK` material appears on no public page; `PASS` and the unsure `UNKNOWN` go on. An ordinary article with only a title (no body, feed summary or post text) waits for material: it is not scored, no copy is written from the title, and it does not enter the public pool; it is judged once the material arrives as a new revision. A displayable original post with empty text or only a link keeps the usual scoring and verbatim display. Items pushed through the ingest endpoint can carry their text, and an X post without text is judged on its title ([X posts through the ingest endpoint](ingest-x.md)).
3. **Score** (`selection-score.md`). The same rubric scores the item twice, independently (0–100). **The two scores adding up to at least 2 × the threshold** is enough; the threshold depends on the source's tier. An item with enough points still has to pass the duplicate check of step 6 to become a pick. Pages show the average of the two (rounded down).
4. **Structure** (`structure.md`). Runs alongside scoring. It gives the category and tags (the ones pages show) and the companies involved, and decides whether the article is one specific piece of news, a roundup of several things, or too thin to tell. For specific news it extracts the facts (who did what to what, and when) with their sources and preconditions in the original. Topic pages, story grouping and the daily brief rely on it.
5. **Title and summary.** Written once structuring is done. Picks and near-picks (averaging above `understandFloor`) get an English title, an answer-first summary and why it matters from `content-understanding.md`; the rest get a short title and summary from `summarize-*.md` and go to "All news". An X post with no text or only links keeps the original post's links, images and quotes, calls no writing or translation model, and gets no "please add the text" copy; a long X post whose real text was fetched is handled as usual. When the written copy uses a word listed in `industry/wording.ts`, the model is asked once to change just those words (`mend-wording.md`).
6. **Grouping and duplicates** (`group-*.md`). Reports of the same thing from different sources become one story; the story page has an overview (`story-digest.md`), and Trending ranks stories. Before changing the overview prompt, compare the current and candidate prompts on the same stories with the [story digest evaluation](story-digest-evaluation.md). An item with enough points becomes a pick only after grouping: the model judges at the same time whether it is the same news as a report already picked, and whether it has specific information the picks have not given yet.
   - Several reports of one piece of news can all be picks. The website folds them into one reading group; the API, RSS and the sync interface show each piece of news once, through a representative report: an official first-party report first; then a verified official account (a `T1_5` account with `publisherRole` and `owner_entity_id` set, whose company is the subject of the news, organizations before people); then one with full text, a higher score, an earlier time.
   - A report that is not the same news but adds nothing new (describing an already announced capability in other words, availability on one more platform, a roundup repeating points already picked) is not picked and stays in "All news". A roundup of several things is not a story of its own; it attaches to the stories it mentions and is picked only when it has important content the picks do not cover. Material too thin to tell which news it is does not become a pick.
   - A report explicitly withdrawn keeps its history but no longer takes part in later grouping recall, representative choice, story start or automatic story comparison; the same address and X replies or quotes cannot borrow identity evidence from it either. When the same fact still has live reports, those are used; with every report withdrawn it is not recalled until one is public again. Summary-only or not yet published records are not withdrawn and keep their standing. Existing relations and judgments are not deleted, and nothing is regrouped in bulk.
   - Until it is confirmed, an item is only in "All news", however long it waits. If the model call fails or the answer is malformed, the item stays there: after 10 minutes of waiting an alert goes out, the admin Runs page lists such items, and you can open the item under admin Content and press "Group again". So the grouping model has to answer in the format reliably.
7. **Daily, weekly and monthly briefs.**
   - The **daily brief** comes out every day at 08:00 PT (the times of the three briefs are `EDITION_TIMES` in `site/site.ts`; the defaults are used below) and covers 08:00 PT the day before to 08:00 PT that day (23 or 25 hours on a daylight-saving change). It is put together by rule, without a model. One entry per story: the most authoritative report of the news with the most reports, with the story's other developments that day listed under it; a roundup of several things goes under the most important story it mentions. Anything in the last 7 briefs does not appear again. A story already covered returns in the main section only when the party itself acts again (tutorials and opinions, the `commentary` category, do not count) or the development has 4 or more sources; otherwise it goes to the briefs list. A story with no picked report but an official original post and 3 or more independent participants is added too (only to the daily brief: not a pick, not pushed). Entries are ranked by importance (the highest score among picked reports, the independent participants discussing it that day, whether there is an official original post, minus points for a follow-up). The top 12 go in the main section, at most 2 from one source, then up to 10 one-line briefs. The first entry is the lead story, introduced by its own title and summary; entries 2–4 are the highlights.
   - The **weekly brief** (Mondays at 10:00 PT) and the **monthly brief** (the 1st at 10:30 PT) are compiled from that week's or month's dailies. A story across several days counts once and is ranked by its place in the dailies (lead, highlight, days covered), its coverage and its score; the weekly takes the top 20 and the monthly the top 30, in the dailies' sections. The model (`report-period.md`, `report-period-sections.md`) writes only the overview and a one-line introduction to each section of three or more entries, and adds or removes no entry. If it writes a name or number that is not in the entries (a Latin-letter name, a number of three or more digits or with a decimal point or percent sign, a company in the word list), that text is dropped: the overview becomes a sentence from a template and the section gets no introduction. Common industry terms (`PLAIN_TERMS` in `taxonomy.ts`) and the site name are exempt.
   - Each pick goes into one issue only, by its time; one confirmed as a pick later than its time goes by the confirmation time, and one confirmed after the cutoff goes into the next issue.
   - Briefs are checked every half hour: an issue that is due comes out once, and one already out is not rewritten. Issues missed while the site was down, or that failed, are made up in later checks. A daily window in which material was judged but no new story appeared still produces an empty issue; a window in which nothing was judged counts as a failure, and a missing issue alerts as described in [Deployment](deploy.md#updating). A weekly or monthly period whose dailies are all present but have no original entries is skipped: no empty weekly or monthly, no model call, recorded as neither generated nor failed; the first period checked starts at the site's earliest daily. When there is nothing to compile, a missing daily or entries that later stopped being public keep their error. A skip leaves no permanent mark, so correcting a daily within the make-up range lets the issue be generated again.

Every step's prompt is in `industry/prompts/`, so changing a prompt needs no code change. A prompt's version is the hash of its content: after a change, new material is judged by the new version, and material already judged is not recomputed.

## Thresholds: `industry/selection.ts`

```ts
export const SELECTION = {
  thresholds: { T1: 60, T1_5: 65, T2: 76 },   // the average of the two scores must reach this
  understandFloor: 50,                        // items not picked but averaging above it are written like picks
};
```

Official first-party sources (T1) have a lower threshold and media and individuals (T2) a higher one: for the same news, the official original is worth reading first. A tier with no threshold (`EXCLUDE_MP`) takes no part in picking.

These are the thresholds AIHOT has used for AI news, and they are strict: better a few picks too few than noise among them. After changing the industry or the rubric, recalibrate them as below.

## Calibration

### 1. Prepare a sample set

Pick 100–200 items from your own sources, label each one "pick" or "don't pick", and save them as `.data/gold.jsonl` (`.data/` stays out of Git). One per line:

```json
{"caseId":"law-001","material":{"title":"Original title","originalTitle":null,"publishedAt":"2026-10-01T09:00:00-07:00","sourceName":"Source name","bodyZh":null,"bodyOriginal":"Body text..."},"sourceFacts":{"sourceKind":"rss","sourceTier":"T1","firstParty":true,"language":"en"},"samplingContext":{"benchmarkSplit":"development","samplingStratum":"regulation"},"gold":{"decision":"select"}}
```

| Field | Meaning |
|---|---|
| `caseId` | A unique id |
| `material` | Title, original title, publication time, source name and body (`bodyZh` holds a body already in the site's reader language, `bodyOriginal` the original; one is enough) |
| `sourceFacts` | Source kind, tier, whether first party (on the site only `T1` is first party; label the same way) and language. The tier picks the threshold |
| `samplingContext` | Optional. `benchmarkSplit` separates the development and holdout sets; `samplingStratum` is a group of your own (say "new rule", "ruling", "marketing") to see which kind goes wrong |
| `gold.decision` | `select` pick, `reject` don't pick, `either` could go either way (not counted in accuracy) |

`industry/gold.example.jsonl` has two examples.

Some advice:

- Include many **hard cases**: ones that should only just be picked or only just be left out. Too many obvious ones inflate the accuracy.
- Keep part as a **holdout set** (`benchmarkSplit: "holdout"`). Tune the prompt on the development set only, and check with the holdout set at the end, so the prompt is not tuned to these few questions.
- The labeller should be someone who will read the site, or someone with the same taste.
- The evaluation runs only the pre-screen and the two scores, not the duplicate check of step 6: label by whether the item itself deserves picking, not "don't pick" because another report of the same news was already picked.

### 2. Run the evaluation

```bash
node --env-file=.env scripts/eval-selection.ts --gold .data/gold.jsonl --split development --label "rubric v1"
```

Each sample goes through the pre-screen and both scores, and the output gives:

- **accuracy, precision, recall and F1 on valid outputs**: only non-`either` samples that got a pick decision, to judge how right the model is when it answers;
- **coverage**: the share of all non-`either` gold samples that got a pick decision; **complete accuracy** divides by all non-`either` gold samples, so a model failure or a malformed answer counts as not done right;
- `either` never enters the denominators above; the report counts failures on decided samples and on `either` samples separately. `goldSelectRate` is computed over all non-`either` gold samples, so it is the same across models on the same samples;
- what each threshold from 40 to 90 in steps of 2 would give (change the range in `DEPLOYMENT.selectionGold`, below), again with valid-output accuracy, coverage and complete accuracy;
- the misjudged items. The full report goes to `.data/eval/` and is imported into the admin's SelectBench (`--no-import` skips that).

Without `--models` it uses the model the "selection score" step uses on the site: one switched on the admin's Models and evals page wins, then the `SCORE_MODEL` environment variable, then `DEFAULTS.score` in `site/models.ts`, and otherwise the default model (`LLM_*` in `.env`). `--models default,deepseek-flash` compares several models on the same samples. Other common options: `--n 200` the most samples to draw, `--split holdout` only the holdout set, `--no-import` no SelectBench import. Set the sample file, sample count, split and threshold range in `DEPLOYMENT.selectionGold` in `site/site.ts` to run with no options.

Within one run, samples that render exactly the same scoring input share the model's scores, but each is still scored against its own pre-screen result, tier threshold and label; failures are shared within the run too, so a first run and a rerun on existing results cover the same samples. Repeated runs reuse existing receipts. Token use and mean latency in the report add up every request attempt behind the receipts involved, including retries after a parse failure; a rerun on existing results shows the accumulated use of those receipts, which is not new spending.

### 3. Read the misses, change the rubric, run again

In the admin's SelectBench, go through the misjudged items and the model's reasons.

When uploading a multi-model report, the same `caseId` must carry the same `gold` label for every model, though the models' `decision`s can differ. A report with conflicting labels is refused before it is written, so one item never shows two different human answers side by side; a report without per-case `cases` can still be imported.

- A pick that was missed usually means the rubric does not say why it matters: write that kind of value into the "must be scored normally" part of `selection-score.md`, with examples.
- A pick that should not have been usually means noise got through: write it into the "must be held down" part.
- When everything is a little too loose or too strict and the misjudged items all score near the threshold, adjust the thresholds in `industry/selection.ts`.

Change the rubric before the thresholds: a threshold can only move everything at once and cannot fix one kind of mistake. Run again after every change; SelectBench compares each version. When comparing models, do not look at valid-output F1 alone: if coverage differs clearly, look at complete accuracy too, so a model that scores high but often fails to give a structured judgment does not hide its failures by dropping them from the denominator.

## Changing models

The admin's Models and evals page shows the model each step uses now, with recent success rate, latency and token use, and can switch it (affecting only new tasks). Before changing the scoring model, compare with `--models` on the same samples.
