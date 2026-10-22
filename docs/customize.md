# Make it your field

By default this repository is an example site for the AI industry: the demo sources are public AI news sources, and the picking taste is the one AIHOT tuned for AI news over a long time. To turn it into a site for law, HR or gold news, nearly everything to change is in two folders: [`site/`](../site/) (this site's own name, copy, brand and pages) and [`industry/`](../industry/) (the industry's categories, sources, prompts and thresholds). The code itself mostly stays as it is.

With an agent such as Claude Code or Codex, you can send it this and then answer its questions:

```text
Please read AGENTS.md and docs/customize.md, and turn this site into a news site for the "XX" field.
What I care about: ... (the sources you want to watch, what news you think matters and what doesn't; the more specific the better).
When you're done, run npm run typecheck, npm test and node scripts/smoke.ts, and tell me which decisions are still mine to make.
```

Here is what it (or you) does, in order.

## 1. Site name and copy: `site/site.ts`

- `name`: the site name, used by navigation, titles, share images, RSS, MCP and the admin. `organization.name` is the site operator in structured data (for search engines) and defaults to the site name, so change both together; `organization.founder` is the founder (optional), whose `sameAs` can list public profile addresses.
- `subject`: the industry word. "AI daily brief" and "All AI news" on pages become "Law daily brief" and "All law news".
- `homeTitle`, `topicsTitle`, `description`, `tagline`, `keywords`: titles of the home and topic index pages, the one-line description, the small text under share images, keywords for search engines.
- `feedbackExample`: the example in the feedback form's text box.
- `locale`: the interface language (the pages' language tag, share cards and structured data); `{{locale}}` in `public/` files becomes it too.
- `since`: the year the site started collecting (the time range in structured data, optional).
- `mcpPrefix`: the MCP tool name prefix; `lawhot` gives `lawhot_get_latest`. Do not change it once people connect.
- `interfaceVersion`: the version of the public interfaces (MCP, OpenAPI, `llms.txt`), which only goes up; raise the major version when you change the meaning of an existing field.
- `crawlerName`: the name sent when fetching sources. Do not use another site's name.
- `contactEmail`: a public contact email (optional); when set, `llms.txt` and the agent guide give it as the licensing contact.
- `footerNote`: one line of small text at the bottom of the About page (`null` for none).
- `icp`, `psb`: ICP and public security filing numbers for sites in mainland China; when set they show in the footer, linked to their records.
- `github`: the source repository address (optional); when set, the sidebar and the bottom of the Me page show a GitHub link.
- `llmsIntro`: a longer introduction under the one-line description in `llms.txt` (optional).
- `rootIcons`: icons beyond the standard ones also served at the site root, as file names in `site/brand/` (optional).
- `timeZone`: the site's time zone (an IANA name such as `America/Los_Angeles`). Every date, brief window and schedule uses it, daylight saving included; `timeZoneLabel` is the short name written after times (such as `PT`).
- `EDITION_TIMES`: when the daily, weekly and monthly briefs come out (local time in `timeZone`). The schedule, the daily brief's window, missing-issue alerts and all copy that mentions a time read it; the scheduler checks every half hour, so use :00 or :30. `EDITION_WHEN` is built from it for sentences ("every day at 08:00 PT", "every Monday at 10:00 PT", "on the 1st of each month at 10:30 PT") and seldom needs a change.
- `POLICY`: names and descriptions of the terms of use and privacy notice pages; `terms.license` says which uses need permission first, and `terms.headers` are response headers in which the public interfaces state the terms (both optional); `xPostIsFullText` decides whether an X post's own text counts as full text (if it does, it shows only when the source allows full text).
- `ABOUT`: the About page's headline, the four steps, an author block (optional), the copyright note, and the anchor of the terms link (`termsAnchor`, optional).
- `CARDS`: the text on each page's share image.
- `NAV`: `hidden` lists engine entries left out of the navigation; for now only Trending (`"/hot"`) and Topics (`"/topics"`), for example `"/hot"` on a site with few sources whose trending list is often empty. They are left out of the desktop sidebar, the phone tab bar and the Me page. The pages still open: opened directly they belong to the Picks tab, back buttons and links that led to them go to Picks, and the page hierarchy for search engines (breadcrumbs) skips them; with `"/hot"` the home page shows no current trending and story pages show no trending rank. It is empty by default, so navigation stays as it is.
  Other entries are not supported yet: their back buttons and in-page links would need the same support, so readers are not led to a page that is hidden only from the sidebar.
- `ITEM_COPY`: what the model's one-line reason is called (`reasonLabel`, "Why it matters" here), and whether readers see the AI score on pages and share images (`showScore`; display only, the public API and MCP still carry scores).
- `REPORTS.quiet`: the title and lead when material was judged in the daily window but nothing big happened; `{start}` and `{end}` in the lead become the window's start and end.
- `REPORTS`: wording on the briefs: the publisher line in the masthead and the word beside it, each brief page's description, what one entry is called (`entry`), units after the masthead's other numbers, and the count wording on share images.
- `ALERTS`, `SOURCE_DEFAULTS`, `COMMUNITY_FEEDS`: wording in alerts that varies by deployment, whether a source created in the admin shows full text by default, and which community sources count heat by the posting account.
- `ACCESS`: the rate-limit wording and suggested User-Agent in the agent guide and `llms.txt`; set `ratePerMinute` only when a reverse proxy in front really limits by IP.
- `ADMIN`: a few hints for admins in the admin (optional).
- `AGENT`: the "search" row of the MCP tool table on the agent page: what it searches and how to ask.
- `DEPLOYMENT`: this deployment's own arrangements: where credential files live, extra credentials the production API checks at start (`requiredSecrets`, empty by default), the CDN origin host, the request header for the admin sign-in redirect, image proxy traffic limits, hosts collection and images reach directly (not through the egress proxy), and the default samples for the selection evaluation. All optional.
- `FEED_COPY`, `PUBLIC_CATEGORIES`: what the "All news" RSS description adds it leaves out; categories that differ between the public interfaces (API, RSS, MCP) and the pages: `merge` publishes one category inside another, `feedLabels` renames a category in its RSS title. Do not change them after launch.

The site address is not set here but with the `SITE_URL` environment variable at deployment.

## 2. Categories, tags and topics: `industry/taxonomy.ts`, `industry/topics.json`

- `CATEGORIES`: the filter categories of the home page and "All news". `key` appears in addresses and interfaces (`/all?category=`, `/feed/category/<key>.xml`), so do not change it after launch; `label` is the display name; `section` is the section in the briefs (categories can share one); `guide` says what the category holds and where it ends against its neighbors, shown to the model when structuring (the general rules are in `prompts/structure.md`); `commentary: true` marks commentary (tutorials, opinions): when a covered story gets this kind of follow-up, even from the party itself, the daily brief lists it only among the briefs (unless 4 or more sources report it); `feedLabel` is the name in the category RSS title (`label` when unset). To publish one category inside another in the public interfaces, RSS and MCP (pages still separate them), use `PUBLIC_CATEGORIES` in `site.ts`.
- `RELEASE`: the industry's most watched kind of release (new models for AI), matched on both category and tag. The daily masthead's "N new models" counts it (when the admin changes a category, published dailies are recounted); `unit` is the word after the number. For an industry without one, set it to `null` and the masthead shows no such number.
- `PLAIN_TERMS`: common industry words (lower case) the weekly and monthly overviews may use without finding them in the entries. The site name counts automatically. An overview that writes a name or number not in the entries is dropped; see [Selection and calibration](selection.md).
- `CATEGORY_TAGS`, `TOPIC_TAGS`, `ENTITY_TAGS`: the only tags the model may choose. The first tag must be a category tag. `prompts/structure.md` also holds the AI industry's tag rules (such as what counts as a "Model release"); change them with the industry.
- `TAG_SYNONYMS`: synonyms the model often writes, mapped to the vocabulary's spelling. With a new vocabulary, list its synonyms here instead.
- `ENTITIES`: the industry's main companies or institutions, for company topic pages. `aliases` are shown to the structuring model; `otherNames` are the company's other names (official account names, sub-brands), also used to match news subjects to the company and to tell whether a title names it. `IDENTITY_LEXICON`, `PUBLISHER_DOMAINS` and `IDENTITY_CONTEXT_ALIASES` stop the model from writing companies the original never mentioned into titles and summaries: a company in the title or summary must appear in the original; `IDENTITY_CONTEXT_ALIASES` lists other ways the original can mention the company (such as an official account name). Clear them if your industry has no such need.
- `ITEM_TYPES`: content types, matching the weight table in the score prompt; change them together.
- `topics.json`: the topic index (`/topics`), read at start, so a change needs a rebuild (`docker compose up -d --build`). Three groups: `company` (companies and institutions), `field` (directions) and `genre` (content formats). Do not change `slug` after launch.
  - A `company` topic uses `entityId` (an id in `ENTITIES`) to collect reports whose subject is that company; when a report has several companies as subjects, it counts only if the title names this one. Optional: `aliases` (searching just this word also finds the company's reports).
  - `field` and `genre` topics use `tags` to collect reports with those tags.

## 3. Sources: `industry/sources.json`

These are the demo sources imported on first start; existing ones are never overwritten. Each start adds only sources that are in the file but not yet in the database, and removing one from the file does not delete it from the database (pause it in the admin instead). After launch, the admin's Sources page is used more: it creates sources, previews fetches, changes intervals, pauses sources and shows why they fail.

Each source's key fields:

| Field | Meaning |
|---|---|
| `kind` | `rss`, `web_list` (a web listing with selectors), `json_list` (a JSON API), `x_search` (an X account, needs SocialData), `mp_account` (a WeChat official account, needs Dajiala), `external` (pushed items) |
| `config` | Each kind's settings; see [Sources](sources.md) |
| `tier` | `T1` official first party, `T1_5` official accounts and near-official, `T2` media and individuals, `EXCLUDE_MP` not picked. Each tier has its own threshold. `T1` is first party; there is nothing else to mark |
| `owner_entity_id` | Optional: the company the source belongs to (an id in `ENTITIES`). A company's several sources count as one participant in heat; a `T1_5` official account needs it to be a representative report (see [Sources](sources.md)) |
| `participation_mode` | `editorial` goes into picks and all news; `hot_signal` counts only as heat evidence; `isolated` appears on no public page |
| `site_fulltext` | Whether the site may show the full text. **Off by default**: only the summary and a link to the original. Turn it on only when the source clearly allows it |
| `syndicate_fulltext` | Whether the full-text RSS may carry the body. **Off by default**; it applies only when the site shows full text too, and should be on only when the source clearly allows republishing |

AI Pulse also has 32 X accounts in `industry/x-accounts.json`. `scripts/seed.ts` creates an `external` source for each, and an outside job pushes their posts ([X posts through the ingest endpoint](ingest-x.md)).

## 4. The picking standard: `industry/prompts/`

This is the step most worth your time: your judgment of the industry is written here.

| File | Role |
|---|---|
| `prefilter.md` | Pre-screen: is the material about this industry? Wide recall; it stops only what is clearly unrelated |
| `selection-score.md` | **The rubric**: a score from 0 to 100, with content types, five dimensions, weights per type, value that must be scored normally, and noise that must be held down |
| `content-understanding.md` | How picks and near-picks are written: an English title, an answer-first summary and why it matters (it gives tags too, but the categories and tags on pages come from `structure.md`) |
| `rules-domain.md` | How industry terms are translated or kept (the examples are AI terms) |
| `mend-wording.md` | Word fixes: when a title, summary or reason uses a word listed in `industry/wording.ts`, the model changes only those words |
| `summarize-*.md` | Title and summary for everything else |
| `structure.md` | Category, tags and companies involved; whether it is one piece of news or a roundup; the news facts (who did what to what, with sources and preconditions in the original). Categories and tags on pages, topic pages, story grouping and daily briefs rely on it |
| `group-*.md` | Story grouping: whether two reports are the same happening, a development of the same story, or two things; and whether a report adds anything to what the picks already hold (if not, it is not picked) |
| `story-digest.md` | The story page overview (compare versions with the [story digest evaluation](story-digest-evaluation.md) before changing it) |
| `report-period.md`, `report-period-sections.md` | The weekly and monthly overviews and section introductions (the daily brief is put together by rule, without a prompt) |
| `translate-*.md` | Full-text translation |

Words your site's writing should not use (hype, dialect, jargon readers do not know) go into `industry/wording.ts`, each a regular expression and a replacement. After the title, summary and reason are written, each is checked; if one is used, the model is asked once to change just those words (the "wording" model step; `WORDING_MODEL` picks a model for it). If a number changes, the title or summary comes back empty, or the model service refuses, the original text stays. An empty list checks nothing, makes no extra call, and the step is not listed in alerts about refused model service.

Prompts use `{{siteName}}` for the site name and `{{> file name}}` to include another prompt. Changing a prompt needs no code change.

**Suggested approach**: keep the structure (five weighted dimensions, the noise rules, the safety limits) and replace only the examples of what matters and what is noise with your industry's. For law, "a new regulation published, an important ruling, a regulatory penalty" should be scored normally, and "law firm marketing, course ads" held down.

## 5. Thresholds and calibration: `industry/selection.ts`

The two scores must add up to at least 2 × the threshold (and the item must pass the duplicate check in grouping; see [Selection and calibration](selection.md)). The default thresholds (T1 60, T1_5 65, T2 76) were calibrated by AIHOT for AI news; with a new industry and prompts, calibrate again:

1. Pick 100–200 items from your sources, label each "pick" or "don't pick" yourself, and save them as `.data/gold.jsonl` (format in [Selection and calibration](selection.md); `industry/gold.example.jsonl` has two examples).
2. Run `node --env-file=.env scripts/eval-selection.ts --gold .data/gold.jsonl` and read the accuracy, precision, recall and the results at each threshold.
3. In the admin's SelectBench, go through the misjudged items, change the score prompt or the thresholds, and run again.

This step decides how well your site picks.

## 6. Brand: `site/brand/`

- `logo.svg`, `icon.png` (512), `icon-192.png`, `apple-icon.png` (180), `favicon.ico`: the site icons.
- `Logo.tsx`: the site mark at the top left of pages, set from the site name by default; with a logo of your own, replace `Wordmark` with your SVG and keep its props.
- `wordmark.svg`, `wordmark-dark.svg` (optional): the wordmark on share images and posters, the dark one on dark share images; without them the site name is set as text.
- `nameplates/`: the masthead lettering at the top of the brief pages. Regenerate them after changing the industry word:
  ```bash
  npm pack @fontsource/noto-sans-sc@5.3.0 && tar xzf fontsource-noto-sans-sc-5.3.0.tgz
  node scripts/nameplates.ts package
  ```
- QR codes on the About page: first write the author block in `ABOUT.maker` in `site.ts` with its `wechat` and `feishu` cards (title and description); then upload the images under admin Settings → About page QR codes, or put them in `site/brand/contact/` with names starting `qr-wechat` or `qr-feishu`, as png, jpg or webp. Without the author block, the card or the image, that QR code does not show.

Do not use the AIHOT name or logo.

On the Me page, readers can switch the font from the site default to the browser's default font. That uses the standard font set in the reader's browser for body text, forms and live chart text; code stays monospaced, and the logo, masthead lettering and share images keep the site brand. The choice is saved only in that browser. Version 1 backups of saved items have an optional `font` field; older backups still import, and importing does not override a browser font the reader already chose.

## 7. Page copy: `site/pages/`, `site/public/`, `site/changelog.json`

- `pages/terms.md`, `pages/privacy.md`: the terms of use and privacy notice. **They are templates**; rewrite them for your situation before launch, with a professional's review if needed.
- `public/`: four fixed files at the site root, published with placeholders filled: `robots.txt`, `manifest.webmanifest` (name and icon when installed on a phone), `openapi-v1.json` (the public API description), and an optional `.well-known/security.txt` (the contact for security issues). Only these four are published; other files placed there never appear on the site, and a missing one returns 404. The files can use these placeholders: `{{siteName}}`, `{{siteUrl}}`, `{{description}}`, `{{tagline}}`, `{{locale}}`, the time zone `{{timeZone}}`, the brief times `{{dailyTime}}`, `{{weeklyTime}}`, `{{monthlyTime}}`, the public interface version `{{version}}`, and the comma-separated public categories `{{categoryList}}`; in a JSON file, `"{{categories}}"` in an `enum` or `examples` list becomes the list of public category keys.
- `changelog.json`: the changelog. It comes with a "site launched" example; before launch, set its `date`, `time` and `latestVersion` to your launch time. New entries go first, with `latestVersion` set to their date and time. `kind` is one of `Update`, `Improvement`, `Announcement` and `Retired`; add `"urgent": true` for entries every reader must see (red, marked important).

## 8. Models and deployment

- Models: `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL` in `.env`, any OpenAI-compatible API; every step uses it by default. AI Pulse uses OpenRouter with `anthropic/claude-haiku-5.5` and `LLM_EXTRA_JSON={"reasoning":{"enabled":false}}`, because Haiku 5.5 reasons by default and the reasoning shares the output budget. `site/models.ts` lists named models (each with its own address and key variables) and the default for each step; a deployment can also pick per step with environment variables (see `.env.example`) or on the admin's Models and evals page. With a model that reasons before answering, either turn reasoning off as above or leave room for it: `LLM_REASONING_TOKENS` for the default model, `reasoningTokens` for a named model in `site/models.ts`. Otherwise the reasoning uses up each step's output budget, the answer is empty and calls fail. A score preset can also set `scoreCall: { temperature, maxTokens, timeoutMs }` for temperature, output budget and timeout in milliseconds; the example score presets set them explicitly. A backup model's `fallbackFor` names, by capability, the primary model it takes over from; evaluate the pair on your own material first. The example site has no backup pairs by default.
- Deployment: see [Deployment](deploy.md).

## Checks after the changes

```bash
npm run typecheck
DATABASE_URL=postgres://.../myhot_test npm test       # the database name must end in _test or _ci, and the account must be able to create databases
node scripts/smoke.ts --base http://localhost:3000   # once the site is running
```

Rewriting prompts and recalibrating thresholds do not break the tests: tests recognize requests by each step's rendered prompt and read thresholds from `industry/selection.ts`. Some tests in `tests/` use the example industry's categories, tags and companies (such as `ai-models`, "Model release" and Anthropic). After changing `industry/taxonomy.ts` those tests fail; replace the examples with your industry's equivalents, and leave the rules they test as they are.

Then open the site and look at the home page, all news, the daily brief, topic pages and the About page, and check on the admin's Sources page that every source fetched successfully.
