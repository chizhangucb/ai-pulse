# Deployment

## With Docker (recommended)

You need a machine with Docker (with Compose). A cloud server should have at least 2 cores and 4 GB of memory, which building the image needs.

```bash
git clone https://github.com/chizhangucb/ai-pulse.git
cd ai-pulse
node scripts/init-env.ts --llm-key <your OpenRouter key>
```

`init-env.ts` writes `.env` with random secrets and an admin password, and prints the password once. Without Node on the machine, copy `.env.example` to `.env` and fill in `ADMIN_PASSWORD` (at least 12 characters), `SESSION_SECRET`, `IMG_PROXY_SIGN_SECRET` and `POSTGRES_PASSWORD` (each from `openssl rand -hex 32`) and `LLM_API_KEY`.

Before starting, check `SITE_URL` in `.env`. To try it on this machine, keep `http://localhost:3000`; on a server, set the address readers really use. For example, when readers reach the server by IP (use your own IP instead of the example):

```dotenv
SITE_URL=http://192.0.2.10:3000
```

Absolute links in RSS, share links, the sitemap and Agent Markdown all use this value, and it does not follow the address a browser happens to use. With a domain and HTTPS, set it as in "Domains and HTTPS" below.

Then start:

```bash
docker compose up -d --build
```

Open `http://server-address:3000`; the admin is at `/admin`, signed in with the admin password. The first start imports the demo sources, content starts to appear after a minute or two, and the hundred-odd items of the first import take about half an hour to process (each is pre-screened, scored, structured, given a title and summary, and grouped).

`docker compose` starts five containers: `db` (PostgreSQL 17), `setup` (runs database migrations and seed data at every start, then exits), `api` (also the jobs that read or write the data volume: housekeeping of its files, feedback forwarding, backups, image preparation and content pushes), `worker` (fetching, model processing, the other scheduled jobs) and `web` (pages). `web` gets only page settings such as the site and API addresses and reads the API over HTTP; the database, models, admin secrets and data volumes are given only to the backend containers.

### Servers in mainland China

- Build with a mirror for npm: `docker compose build --build-arg NPM_REGISTRY=https://registry.npmmirror.com`, then `docker compose up -d`.
- If pulling Docker images is slow, configure a registry mirror for Docker first.
- If sources outside China cannot be fetched, set `EGRESS_PROXY_URL` in `.env`: fetching sources and images goes through that proxy, model calls do not.
- Serving a public website needs an ICP filing first; put its number in `icp` in `site/site.ts`.

### Domains and HTTPS

Point the domain at the server, then set in `.env`:

```bash
SITE_URL=https://example.com
SITE_DOMAIN=example.com
PORT=127.0.0.1:3000        # port 3000 is only for the local Caddy, not the outside
TRUST_PROXY=true           # visitor addresses come from the headers Caddy forwards
```

Start with HTTPS, and Caddy requests and renews certificates by itself:

```bash
docker compose --profile https up -d --build
```

With an existing Nginx, skip Caddy: reverse-proxy the site to `http://127.0.0.1:3000` with `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`, and set `TRUST_PROXY=true` in `.env`. `SITE_URL` must be the address readers really use: links, RSS, share images and MCP all use it.

MCP accepts the `SITE_URL` host and `localhost`, `127.0.0.1` and `[::1]` by default. Add hosts with `MCP_ALLOWED_HOSTS`, comma separated, for example `extra.example:8443,[2001:db8::1]`. Host names are case-insensitive and IPv6 needs brackets; a decimal port from 0 to 65535 may follow and is ignored when matching. Entries with a path, user info or an invalid port do not take effect. Aliases such as `127.1` must be listed explicitly; this setting affects only the Host check and does not widen the browser Origin allowance.

With a cache in front such as Nginx or a CDN, follow the cache lifetimes the application returns (`Cache-Control`): public pages, navigation data, API, RSS, item Markdown, brief share images, the sitemap, and the agent guide `/api/v1/agent` and `/openapi-v1.json` (which must also revalidate after five minutes). Do not add a longer lifetime, do not serve stale content offline after expiry, and do not restart a stale response's age when forwarding it; do not stack proxy and CDN caches on dynamic content. The framework does not manage a self-hosted site's CDN or purge its caches.

### Updating

**AI Pulse (English site, Pacific time).** This fork moves the site to English and to `America/Los_Angeles`:

- Every date, brief window, schedule and time shown to readers uses `SITE.timeZone` in `site/site.ts` (America/Los_Angeles, daylight saving included) instead of a fixed UTC+8. The daily brief comes out at 08:00 PT and covers the 24 hours (23 or 25 on a daylight-saving change) before it. Briefs already generated keep their windows.
- A source date without a zone and without `publishedAtUtcOffset` is read in the site's zone on that date, not `+08:00`. A source that prints China time sets `"publishedAtUtcOffset": "+08:00"`.
- The reader language is English: English bodies and posts are not translated (no model call), and other languages are translated into English. Titles, summaries and briefs are written in English by the prompts in `industry/prompts/`.
- Categories add `compute` and `policy`, and the tag vocabulary is English. A database that already holds analyses with the old Chinese tags keeps them; re-run analysis to retag.
- The MCP tool prefix is `aipulse_`. `.env.example` defaults to OpenRouter (`anthropic/claude-haiku-5.5`); `site/models.ts` adds OpenRouter presets for per-step overrides.
- `scripts/seed.ts` also creates one editorial `external` source per account in `industry/x-accounts.json`, for posts pushed to `POST /api/ingest/items` (see [X posts through the ingest endpoint](ingest-x.md)). Run it again after upgrading. `scripts/check-sources.ts` fetches every demo source the way the admin preview does.
- The Meta source is now the Meta Newsroom AI feed (`rss-meta-newsroom-ai`): the `ai.meta.com/blog/` index stopped listing new posts after July 27, 2026. The demo sources also add the GitHub release feeds of vLLM, Ollama and Transformers (`gh-vllm`, `gh-ollama`, `gh-transformers`), without release candidates (and, for vLLM, without its `proto-v*` releases). `scripts/seed.ts` adds the new sources and leaves existing ones as they are; on a site seeded earlier it pauses `web-meta-ai-blog` once, the way the admin does, and records it in the audit log, so turning it back on in the admin sticks. Its stored articles stay.
- Pushed items accept a `text` or `body` field, and a pushed X post without one is judged on its title ([X posts through the ingest endpoint](ingest-x.md)). `.env.example` turns off Haiku 5.5's reasoning on OpenRouter (`LLM_EXTRA_JSON={"reasoning":{"enabled":false}}`); add that line to an existing `.env`. Model calls record OpenRouter's reported charge as their actual cost.
- The admin UI, its messages, alerts and reports, `.env.example`, the README and these documents are in English. `scripts/seed.ts` renames what the Chinese release stored: the password admin "管理员" becomes "Admin", the two Feishu content targets get English notes, and earlier automatic receipt releases get the English note, so they are still released only once. A name or note an admin changed is left as it is. Run the seed after migrating, as above.
- No database migration.

The optional `PRIVATE_FEED_HOSTS` is new: when a source's feed or listing is a service on your private network (such as RSSHub), list its host name there instead of turning on `ALLOW_PRIVATE_NETWORK_FETCH` for the whole site; see [Sources](sources.md). Behavior is unchanged when it is unset; no database migration.

A weekly or monthly period whose dailies are all present but have no original entries is skipped, instead of reporting an error every half hour, and no empty weekly or monthly appears in the archive. The first period checked starts at the site's earliest daily; when there is nothing to compile, a missing daily or entries that later stopped being public or are being corrected by hand keep their error. No migration or configuration change; it takes effect at the next scheduled check.

The native video fix adds playback controls to existing usable videos and removes empty players, without writing back to articles or calling models. Media addresses an older cleanup already dropped cannot be recovered from the archive; the upgrade does not re-extract in bulk, existing successful bodies skip extraction, and re-extracting with the same content hash may keep the old HTML. New bodies keep native video as described in [Sources](sources.md); the files are still fetched by the browser straight from the original site, and signed addresses may expire.

Inline SVG charts in article figures are replaced by the text descriptions the original site wrote (see [Sources](sources.md)), for bodies extracted from now on; stored bodies stay as they are, and nothing is re-extracted in bulk.

Back up first, as in [Backups](#backups) below. Once the build is done, stop the old services, then run the migrations and the new version:

```bash
git pull
docker compose build
docker compose stop api worker web
docker compose run --rm setup && docker compose up -d
```

Start the services only after the migrations succeed; if they fail, read the error before going on. Sites with HTTPS keep `--profile https`. The old API and worker must stop before migrating: migrations may drop tables or columns, and old code still running would fail; a normal worker shutdown waits for paid calls in progress to finish (up to 270 seconds, `STOP_TIMEOUT_MS`). On Railway and Render the old services keep running while migrating; see [Migrations and deploy order](#migrations-and-deploy-order). Without Docker, update in the same order: back up, build, stop API/worker/web, migrate (`scripts/migrate.ts`), seed (`scripts/seed.ts`), start.

A new migration that meets a long-held lock reports the file name and the wait timeout; deal with the transaction holding the lock, then run setup again, without skipping the migration or rewriting the migration ledger. An interrupted concurrent index build may leave an invalid index: after checking the object named in the error, remove that failed index with `DROP INDEX CONCURRENTLY <index name>` and run again; a valid index of the same name with a different definition needs its difference checked first. These protections do not change the Docker update order above, and upgrading across old versions may still run historical destructive migrations.

What to watch for in each update follows, newest first.

#### Railway and Render configs, and the api runs the jobs that use the data directory (October 22, 2026)

- `.railway/railway.ts` describes the Railway project in Railway's infrastructure-as-code format, and `render.yaml` is a Render Blueprint for the same layout; see [On Railway](#on-railway) and [On Render](#on-render).
- The api now runs the jobs that read or write the data directory, because on Railway and Render only the api has the volume: `ops.retention` (feedback screenshots and the image and share-image caches), `feedback.forward`, `ops.backup`, and the `media.prepare` and `notify.selected` queues. The worker runs everything else. With docker compose both share the `data` volume, so nothing moves; the api now also opens the job queue's own database pool (up to 4 connections). Keep the api running wherever the worker runs.
- The worker's stop drain is `STOP_TIMEOUT_MS`, 270 seconds by default (it was a fixed 470). Unfinished jobs are failed at the deadline and retried by their queue. `docker-compose.yml` gives the worker 315 seconds to stop (was 515) and the api a 30-second drain with 45 seconds to stop. Without Docker, change systemd or pm2 as in [Without Docker](#without-docker).
- A starting worker waits until every migration in its release is applied, so it never runs against an older schema.
- No database migration.

#### Claude Sonnet for writing, and unknown step models stop startup (October 22, 2026)

- `site/models.ts` adds the optional OpenRouter preset `or-claude-sonnet` (`anthropic/claude-sonnet-5.5`). To have Sonnet write the headline, summary and why it matters while the other steps stay on the default model, add `UNDERSTAND_MODEL=or-claude-sonnet` to `.env`. The preset sends no `reasoning` field: `LLM_EXTRA_JSON` applies only to the default model.
- A `*_MODEL` variable that names no preset (a typo such as `or-claude-sonet`) now stops the API and worker at startup with an error naming the variable, instead of silently running that step on the default model. Check these variables in `.env` before updating. An admin choice on the Models page that names a removed preset is still ignored.
- Migration `0090` adds a budget row for the `openrouter` service (300 per minute, 6,000 per hour, 40,000 per day), so the OpenRouter presets go through the budget circuit breaker; before it they had no limit. A row you already added is kept; change the limits under admin Settings.

#### Missing-daily alerts track the date

Missing-daily alerts track the specific date in the site's time zone and do not recover by themselves across midnight; a recovery notice goes out only when that daily exists. New gaps are checked over the last 7 calendar days (today included), no earlier than the earliest daily or `reports.compose` run; with no history only today is checked. A date already alerted stays tracked for those 7 days, and turning off collection or models, or the worker's startup grace period, does not count as recovery; a date still without a daily after 7 days gets one "could not be made up, reminders stop" notice and no more. The old `report.daily` state migrates by its first alert time and keeps the reminder interval. The alert two hours after the edition time, hourly reminders and the Feishu switches are unchanged; no database migration. A custom responder matching the old `report.daily` exactly needs to recognize the `report.daily:YYYY-MM-DD` date key.

#### Word fixes for reader text (October 9, 2026)

No migration and no required new environment variable. The industry pack adds `industry/wording.ts` (words reader text should not use, empty in the template) and the prompt `mend-wording.md`; both come with the update when merging and do not conflict with your own industry pack. An empty list checks nothing and calls no model; once it has words, a title, summary or reason using them costs one more model call (the "wording" step; the optional `WORDING_MODEL` picks a model for it). See [Make it your field](customize.md).

#### Leaving entries out of the navigation

No migration and no new environment variable. `site/site.ts` adds `NAV.hidden` (for now only Trending `"/hot"` and Topics `"/topics"`; see [Make it your field](customize.md)). The framework reads it from `@aihot/site`, so **a site maintaining its own `site/site.ts` adds `NAV` from the template when merging**, or the type check fails. It is empty in the template, so navigation stays as it was; hiding an entry does not close its page or public interfaces.

#### Original posts and engine sync (October 6, 2026)

No new required environment variable or database migration. Sites maintaining their own `site/site.ts` need `REPORTS.quiet`, as in the example config: when material was judged in the daily window but nothing big happened, the issue still comes out with these two sentences as title and lead; `{start}` and `{end}` in the lead are the window's start and end. A window in which nothing at all was judged still counts as a collection or judgment failure rather than a quiet day.

X posts with empty text or only links keep their original links, images and quotes and call no writing or translation model; when the source allows full text, image-only posts can show too, and existing display and redistribution permissions still apply. Long X posts whose real text was fetched are handled as usual. Old translations no longer appear on these posts' public pages. Posts that already got a wrong title and summary can have their public content rebuilt after the update with `publishArticle(id)` from `packages/backend/src/publication/publish.ts`, without calling a model again.

MCP `subscriptions/listen` now returns HTTP 404 with JSON-RPC `-32601 Method not found` at once. The server never pushes changes, and ordinary tool calls work as before; a client getting this answer should not retry a standing subscription.

Tests that need no database are now `*.standalone.test.ts`; `npm test` still runs every backend test and copies the database only for files that need it. `npm run test:standalone` runs those tests alone.

#### Community fixes, time rules and read optimizations (October 4, 2026)

The public interface version stays 4.0.0. No required new environment variable; one optional new one, `LLM_REASONING_TOKENS` (see the `site/models.ts` item below).

**Switches accept only `true`**: every `*_ENABLED` switch in `.env` (`COLLECT_ENABLED`, `MODEL_CALLS_ENABLED`, `FEISHU_*_ENABLED`, `INDEXNOW_SUBMIT_ENABLED` and so on) is on only when written as lower-case `true`. `1` or `TRUE` used to count as on and now count as off; check `.env` before upgrading and change them to `true`.

**Migrations**: seven new migrations; follow the steps above and let setup finish. None deletes data, rewrites articles or existing vectors, or calls a model; migrations are recorded by full file name, and different files with the same number each run.

- `0055_publication_selected_published_idx.sql`, `0056_analyses_composite_id_idx.sql`, `0056_publications_pool_category_timeline_idx.sql`, `0057_publications_pool_channel_timeline_idx.sql`: query indexes built concurrently, without blocking normal reads and writes.
- `0056_publication_release_selection_stats.sql`, `0057_analyze_publication_release_selection.sql`: create and collect query statistics for public lists.
- `0083_publications_selected_source_idx.sql`: a covering index, built concurrently, for counting picks per source, which reduces reads for admin statistics.

Together with these indexes this cuts the database cost of public reads and story recall; interface content, search weights and the range of story candidates are unchanged.

**Sites that changed these files compare them with the new ones when merging**:

- `site/site.ts` gains several entries:
  - `EDITION_TIMES`, `EDITION_WHEN`: when the briefs come out, previously hard-coded; the schedule, the daily window, missing-issue alerts and copy mentioning times read them. Files in `public/` use the placeholders `{{dailyTime}}`, `{{weeklyTime}}`, `{{monthlyTime}}`.
  - `ITEM_COPY`: what the reason is called, and whether pages and share images show scores.
  - `REPORTS.descriptions`, `entry`, `metricUnits`, `shareUnit`: brief page descriptions and wording on the briefs.
  - Copy in `ABOUT` and `CARDS` mentioning edition times and the reason now refers to the entries above.
  - `DEPLOYMENT.directImageHosts` is renamed `directFetchHosts`; collection and images share this direct-connection list.
  - `SITE.feedbackLead`, `SITE.feedbackEmailHint`: the line under the feedback page title and the email box hint, previously hard-coded.
  - `SITE.psb`: an optional public security filing number, `null` when not applicable.
  - `ABOUT.lead` no longer has spaces around `{sources}`; the page adds them.
- `site/models.ts`: score call parameters are now set by a named preset's `scoreCall`; if you keep `glm-5.3-flash-selection`, sync the example's temperature, output budget and timeout. Existing custom models without it keep the engine defaults.
- `ModelPreset` in `site/models.ts` and `Founder` in `site/site.ts` are now imported from `@aihot/contracts/site-config`, keeping the existing config values; if you customized these files, sync the type imports so you do not miss optional fields the engine adds.
- A database migration that meets a running `pg_dump` waits first, at most as long as the worker drain time; on timeout it exits before running that migration, and you rerun the update once the dump is done. Other locks still fail fast.
- A migration drops the retired column `translation_attempts.request_tag`; translated bodies, attempt records and paid receipts stay. The original precision of source publication times is now stored separately; old material whose precision cannot be known stays unknown, and midnight is not assumed to mean the source gave only a date.
- `site/models.ts`: the budget for reasoning models is configured explicitly. The default model uses `LLM_REASONING_TOKENS` and named models `reasoningTokens`. Named models ending in `-think` used to get 4000 extra tokens; that rule is gone, so add `reasoningTokens: 4000` to any such model you added to keep its budget. When a reasoning model uses up its budget, the error says `finish_reason=length` and which setting to change.
- `industry/prompts/story-digest.md`: story overviews are written differently: the first sentence states the core change and the current conclusion, then necessary background, in short paragraphs, without retelling the timeline by date or commenting on the reporting, and without a hard-coded industry. Existing overviews are not rewritten in bulk and change gradually with new reports; to rewrite a few stories at once, see the last section of the [story digest evaluation](story-digest-evaluation.md) (`rewriteStoryDigest`, one model call per story).
- Your own Compose file can drop `LOCAL_ROUTER_URL`: warming share images now reuses the backend renderer instead of requesting a fixed local port, nothing reads that setting any more, and the bundled `docker-compose.yml` no longer has it. Share image addresses, formats and caching are unchanged.

**Collection and publication times**:

- **A source's archive is no longer collected after its first import**: after a new source's first import, the second fetch used to take every older item left in the feed as history and pay to analyze each (over a thousand at once for the demo sources). Later fetches now take only items published within 48 hours before the source's first import or later; undated items are still collected, and X accounts are not affected; see "Old articles don't flood the site" in [Sources](sources.md#rule-old-articles-dont-flood-the-site). Old items collected before the upgrade are archived by their original time, never in "today" or the daily brief, and their analysis finished long ago, so nothing needs doing.
- **New material without a trustworthy publication time is not public at first**: it stays out of public lists, picks, briefs, trending and pushes until a date is read from the source or the article page. While the date is unknown, the article page, structured data and Agent Markdown say "collected", RSS gives no `pubDate`, and the OpenAPI notes that the `publishedAt` of story timelines and daily briefs is then the collection time.
- **Times without a zone in JSON APIs** (such as `2026-09-30 17:43:58`) are read with the source's `publishedAtUtcOffset`, or unset, in the site's zone (`SITE.timeZone`) at that date's offset. They used to be read in the server's zone, UTC in Docker, so new items from such sources now get the correct time.
- **Article page dates use the same source zone**: date fill-in on detail pages and body extraction use `detail.publishedAtUtcOffset`, then the source's `publishedAtUtcOffset`, then the site's zone. This applies to later collection and fill-in only; existing publication times are not rewritten in bulk.
- **Detail fill-in**: dates, titles and summaries that failed or ran past a round's limit are filled in by later collection, and confirmed bodies stay as they are; when a source request succeeds but misses a date, title or body, it is filled in too and recorded in source health. Jina detail rules must match the format returned; fixed starting points, Intercom dated sections and video descriptions are configured as in [Sources](sources.md).
- **Video player pages are not bodies**: for every source, YouTube and Vimeo player pages are no longer fetched as article bodies, and YouTube video pages are no longer taken as images. RSS video descriptions are only summaries, and real text a feed provides stays. The upgrade does not delete or re-analyze existing bodies in bulk; for old video records with player navigation mixed in, check each one and set it to summary only on its detail page under admin Content to stop showing the wrong body.
- **RSS**: a text feed whose summary is known to be the full text can set `summaryIsBody` (Atom `summary` counts too). A podcast episode with no web page now links to its audio or video file and fetches no page.
- **Preview and real collection share the same filters**: the admin's "Preview fetch" applies address prefixes, categories, noise words, address rewrites and `publishedAfter` too, so the items in a preview are the ones real collection stores.
- **No source icons while collection is off**: when `COLLECT_ENABLED` is not `true`, the daily 04:40 job that fetches source icons stops too and no longer visits source sites.
- **Verified historical dates can be corrected**: an operations script calls `previewPublicationDateCorrection` in `admin/content.ts` first, then `correctPublicationDate` with the version and checksum the preview gave, recording the operator and reason. Only explicit corrections where both old and new dates are older than the seven-day window are accepted; material revisions, picks and grouping stay, and no model runs again. When the material or date changed, or the correction would change another public decision, it is refused and must be checked again; there is no bulk backfill and no new public interface.
- **Public scores can be corrected or withdrawn by hand**: the admin's content detail offers "From the model", "Withdraw score" and "Manual score". A manual score takes 0–100, withdrawing makes the public value `null`, and clearing the override restores the stored model score. A correction needs a reason and a version check, keeps the original analysis and audit record, and updates pages, API, RSS, Agent Markdown and MCP together without rerunning the model. Existing articles are not rescored or repicked in bulk by the upgrade.

**Public outputs**:

- **Category filters follow `PUBLIC_CATEGORIES`**: the `category` of API, RSS and MCP takes every category counted as that one in the public interfaces. On sites that merge no categories (the default), filtering by `tip` no longer brings in opinions; industries without a `tip` category pass the type check too.
- **Past briefs still need revalidation**: a date, week or month fixes which issue it is, not that its content never changes. A brief keeps the titles and summaries written when it came out, while source names and citation times follow the current public material; withdrawn citations, and the introductions and covers that depend on them, are no longer served. Clients keeping copies of briefs re-request with `If-None-Match` when `Cache-Control` expires.
- **Sites that configured Nginx or CDN caching themselves check their rules**: compare with the end of [Domains and HTTPS](#domains-and-https), and purge existing proxy and CDN caches of these paths when updating, including the agent guide `/api/v1/agent` and `/openapi-v1.json`.
- **A failed sitemap rebuild no longer serves the old file forever**: the process, the disk copy and the HTTP response share the original five-minute lifetime, and when it has expired and cannot be rebuilt the response is `503` with `Retry-After`. MCP stays `no-store`; API and agent content revalidate after expiry.

**Tools and fixes**:

- **Story digest evaluation**: `scripts/eval-story-digests.ts` exports real stories from the database and runs the current and candidate prompts side by side on them; see the [story digest evaluation](story-digest-evaluation.md). The three evaluation scripts share `scripts/eval-tools.ts`; `eval-selection.ts` fails at once on a mistyped `--n`, `--concurrency` or model name.
- **Migrations do not block reads and writes**: each new migration file holds one statement safe to run online, with no whole-table backfill or rewrite, and indexes use `CREATE INDEX CONCURRENTLY IF NOT EXISTS`; CI checks with `scripts/check-migrations.ts`. Statistics maintenance targets specific tables and columns; the rules are in [Architecture](architecture.md#database-migrations).
- MCP requests have a size limit, and error logs drop credentials.
- The desktop sidebar shows a thin scrollbar when zoomed in.
- Tests recognize requests by each step's rendered prompt and read thresholds from `industry/selection.ts`, so rewriting prompts and thresholds for another industry no longer breaks them; the architecture test no longer depends on the path separator.

#### Site files move into `site/` (October 4, 2026)

The public interface is unchanged; the version stays 4.0.0.

- **The site's own files moved from `industry/` to `site/`**: `site.ts`, `models.ts`, `brand/`, `pages/`, `public/`, `changelog.json`. `industry/` keeps only industry knowledge: `taxonomy.ts`, `topics.json`, `sources.json`, `prompts/`, `selection.ts`. If you changed these files, move your changes to the files of the same name under `site/` when merging.
- **`site.ts` gains several entries**, all optional: `SITE.github`, `SITE.llmsIntro`, `SITE.rootIcons`, `POLICY.terms.license`, `POLICY.terms.headers`, `ABOUT.termsAnchor` (QR cards can have an `alias`), and `ACCESS`, `ADMIN`, `DEPLOYMENT`, `FEED_COPY`, `PUBLIC_CATEGORIES`; see [Make it your field](customize.md). `PUBLIC_CATEGORIES` replaces 4.0.0's `publicAs`: a category that had `publicAs: "tip"` now goes in `PUBLIC_CATEGORIES.merge` (the key is the category key, the value `"tip"`).
- **`DEPLOYMENT.requiredSecrets`** lists extra credentials the production API checks at start, empty by default; the basic session, image signing and admin sign-in checks still apply. Fill it only when your deployment requires an optional integration to be configured.
- **Features only your site has can be modules**: put them in `modules/<name>/` and enable them in the lists in `site/modules/`; see "Modules" in [Architecture](architecture.md). The framework itself ships no module.
- **The agent page opens on MCP by default** and lists three ways to connect: MCP, RSS and API. The Agent Markdown interface stays at `/api/v1/agent`, reachable from "Agent guide" at the bottom of the page.
- **The image proxy can have traffic limits**: `IMGPROXY_UPSTREAM_MB_PER_MINUTE`, `IMGPROXY_UPSTREAM_GB_PER_DAY` (or `DEPLOYMENT.imageUpstreamBudget` in `site.ts`), unset by default.
- **Fixes**: the same data always gives the same bytes (ties in sorting get a unique order, so API and RSS ETags no longer change for nothing); requests the web forwards to the api no longer carry hop-by-hop headers, so `Connection: close` no longer breaks the next POST; `llms.txt` counts the ways to connect as they are instead of saying four.

#### Upgrading to public interface 4.0.0 (October 3, 2026)

- **The model leaderboard, the Codex reset monitor and topic page chronicles are no longer part of the framework** and stay only on AIHOT. The pages (`/leaderboard`, `/codex-reset`), the endpoints (`/api/v1/codex-resets`, `/api/v1/codex-resets/recent`, `/api/v1/agent/codex-resets`) and the MCP tool `<prefix>_get_codex_resets` are gone, and the MCP and `/openapi-v1.json` versions rise to 4.0.0. Migration `0053` drops their tables (`lb_*`, `monitor_*`, `fx_rates`) and settings; their scheduled jobs and queues are removed when the worker starts, and admin run records stay. Back up first if you want to keep that data. Company topic pages show the company's initial as their mark.
- **The industry pack changes in several places**; sites that changed `industry/` compare with the new files when merging:
  - `site.ts` gains `topicsTitle`, `feedbackExample`, `keywords`, `since`, `interfaceVersion`, `POLICY` (names and descriptions of the terms and privacy pages, whether X posts count as full text), `ABOUT.description`, `ABOUT.sourcesFallback`, `AGENT`, `REPORTS`, `ALERTS`, `SOURCE_DEFAULTS`, `COMMUNITY_FEEDS` and `CARDS`; the author block's two QR cards gain `kind`, and `ABOUT.copyright` becomes the two parts around the feedback page link.
  - New `models.ts`: named models and the default for each step, previously in code.
  - The mark at the top left of pages moved from `apps/web/app/components/Logo.tsx` to `industry/brand/Logo.tsx` (later to `site/`, see above).
  - New `public/`: `robots.txt` and `manifest.webmanifest` used to be generated in code and the OpenAPI description lived in `reference/`; now they are files here. The `/.well-known/security.txt` that used to be generated from `contactEmail` is now a file you place yourself at `public/.well-known/security.txt` (later moved under `site/`, see above).
  - `features.ts`, `chronicle.ts` and `chronicles/` are removed; `orgNames`, `leaderboardProvider` and `chronicleTerms` in `topics.json` are no longer used and can be deleted.
  - Categories in `taxonomy.ts` can have `feedLabel` (the name in the category RSS title); `ENTITIES` gains several companies. Categories could then also have `publicAs` to merge into another category in the public interfaces; that field was later removed in favor of `PUBLIC_CATEGORIES.merge` in `site/site.ts` (see above), and writing `publicAs` fails the type check.
- **The push interface's rate limit is configurable**: `INGEST_RATE_LIMIT` sets how many pushes each client may make per minute to `/api/ingest/items`, 10 by default with `docker compose` as before; without Docker there is no limit by default, so set one in `.env` unless a proxy in front limits pushes.
- **Retired environment variables**: `ARTIFICIAL_ANALYSIS_API_KEY` and `MONITOR_MODEL` can be deleted from `.env`.

#### Upgrading to public interface 3.0.0 (October 3, 2026)

- **Safety valves are off by default**: `COLLECT_ENABLED` and `MODEL_CALLS_ENABLED` are on only when written as `true`, and off when unset. A `.env` from `scripts/init-env.ts` already has both lines; add them to a `.env` you wrote yourself, or after the upgrade nothing is collected and no model is called.
- **The weekly and monthly interfaces change shape**: lists and issues of `/api/v1/weeklies` and `/api/v1/monthlies` carry `periodStart` and `periodEnd`, the body becomes `sections[]` (each with `label`, `summary`, `items`) without `title` or `themes`, and a list's `limit` is at most 60. Programs reading them must change; the MCP and `/openapi-v1.json` versions rise to 3.0.0.
- **Machine outputs of picks show each piece of news once**: in the API's `mode=selected`, the sync interface and the picks RSS, only the representative report of a piece of news remains, and the other reports appear as `remove` in sync changes (they stay in `mode=all`). Old picks from before the upgrade are not rearranged until that news gets a new report.
- **Picks wait for the duplicate check**: an item with enough points becomes a pick only after grouping confirms it is not a duplicate of news already picked and brings new information; until then it is only in "All news". When the grouping model's answer is malformed it stays there, visible on the admin's Runs page.
- **First party is the tier alone**: `T1` is first party, and `first_party` is no longer set separately; `T1_5` and `T2` sources once marked first party no longer count as such, so change them to `T1` if they should.
- **The industry pack gains several entries**: `taxonomy.ts` adds `RELEASE` and `PLAIN_TERMS`, commentary categories carry `commentary: true`, `ENTITIES` can have `otherNames`, and `CATEGORY_BY_ITEM_TYPE` is no longer used. Sites already moved to another industry add them when merging, following [Make it your field](customize.md).
- **Topics come only from `industry/topics.json`**: a migration drops the `topics` table from the database. Topics changed only in the database, not the file, should be written to the file before upgrading. Company topics use only `entityId`; `related` is no longer used.
- **Daily briefs call no model**: daily briefs are put together by rule, weekly and monthly briefs are compiled from dailies, and the model writes only overviews and section introductions; issues already out are not rewritten.
- **Prompts changed**: `structure.md`, `group-*.md`, `story-digest.md` and `report-period.md` in `industry/prompts/` are rewritten, `report-daily-lead.md` is removed, and `report-period-sections.md` is new. If you changed these prompts, carry your changes over.
- **Removed scripts**: `scripts/delete-sources.ts`, `scripts/regroup-events.ts`, `scripts/enqueue-analysis.ts`. Pause unwanted sources in the admin; re-evaluate or regroup a single item from its page under admin Content.
- **Admin sessions are bound to the sign-in method** (migration `0041`): after upgrading from a version without session binding, old unbound sessions must sign in again. Databases that already tried the session-binding migration upgrade directly, keeping existing columns and bindings, with no manual change to the migration records. The rules since are under "Admin sessions and configuration changes" below.
- **In 3.x, `/agent` opens Agent Markdown by default**, with MCP instructions at `/agent?tab=mcp`; for the current agent page see "Site files move into `site/`" above.
- **The Feishu content group gets only picks from `T1` and `T1_5` sources.**

### Backups

Set `DB_BACKUP_STORE_*` in `.env` (any S3-compatible object storage), and backups go there every day at 04:10 site time. All four of `DB_BACKUP_STORE_SECRET_ID`, `DB_BACKUP_STORE_SECRET_KEY`, `DB_BACKUP_STORE_BUCKET` and `DB_BACKUP_STORE_REGION` are required. Without `DB_BACKUP_STORE_DOMAIN` the address is built for Tencent COS (`<bucket>.cos.<region>.myqcloud.com`); for other S3-compatible storage, put the bucket's host (with the bucket name, such as `<bucket>.s3.<region>.amazonaws.com` for AWS S3) in `DB_BACKUP_STORE_DOMAIN`.

A full backup is a database `.dump` and a file archive `.tar.gz` with the same timestamp, named after the database: in Docker the database is `aihot`, so they are `aihot-<time>.dump` and `aihot-files-<time>.tar.gz`. The archive holds `uploads/` and any `feedback-screenshots/` still stored locally, not the image cache or the local backup directory. Images already forwarded to Feishu keep only their external reference in the database, and the archive does not hold images stored in Feishu.

To restore, take both files: restore the `.dump` into an empty database with a `pg_restore` compatible with the database version, then unpack the archive at the root of the data directory (`/data` in Docker, `AIHOT_DATA_DIR` without Docker, `.data` by default), keeping its subdirectories, and make sure the running processes can read the files. Restoring only the database does not bring back feedback screenshots still referenced as `local:`; files missing from an old backup cannot be recovered from database references.

The manual export below holds only the database, not those attachment directories:

```bash
docker compose exec -T db pg_dump -U aihot aihot | gzip > ai-pulse-$(date +%F).sql.gz
```

All data is in three Docker volumes: `db` (the database), `data` (uploaded images, the image cache, local backups) and `caddy` (certificates). `docker compose down` keeps them; `docker compose down -v` deletes them.

### Logs

```bash
docker compose logs -f --tail 100 api worker web
```

The admin's Runs page shows each scheduled job's latest results, and the Sources page shows how each source is fetching.

### Admin sessions and configuration changes

Sessions are bound to the sign-in method and to the admin credential or Feishu identity at sign-in. After changing the admin password, the Feishu admin list or the session secret, restart every API process so they all load the same new configuration; editing a config file does not mean running processes use it, and processes mixing old code or old configuration cannot revoke access consistently.

Once the effective configuration changes, password sessions no longer accept the old password's authorization, and Feishu sessions are checked against the current list by the union ID or email actually obtained at sign-in (either one still authorized is enough). Disabling the Feishu sign-in app or changing its app ID ends Feishu sessions; rotating only the same app's secret does not sign out Feishu sessions that are still authorized. Rotating or removing `SESSION_SECRET` ends both kinds of sessions.

Sessions found invalid during authentication are deleted, and restoring the old configuration does not bring them back. The system keeps no history of global credential changes: a configuration change that no process ever loaded, or that no session check observed before it was reverted, cannot be used to revoke sessions after the fact.

## On Railway

Railway is the first host. `.railway/railway.ts` describes the whole Railway project in Railway's infrastructure-as-code format: the four services, their two volumes and every variable name. The Railway CLI's `railway config plan` previews what applying it would change, and `railway config apply` makes those changes. It replaces per-service `railway.json` config files: Railway deprecated those, new services cannot use them, and Railway stops reading them on 2026-12-01.

| Service | Role |
|---|---|
| `web` | Pages, RSS and the public API; the only service with a public domain |
| `api` | The backend, with the volume `api-volume` (5000 MB in `sfo`) at `/data`; also runs the jobs that read or write `/data` |
| `worker` | Collection, model calls, grouping, reports and the other scheduled jobs; no volume |
| `Postgres` | PostgreSQL 17 from the `ghcr.io/railwayapp-templates/postgres-ssl:17` image (Railway's PostgreSQL with SSL), with the volume `postgres-volume` at `/var/lib/postgresql/data` |

The file declares `Postgres` with `service()`, not Railway's `postgres()` database helper. `postgres()` always uses Railway's newest PostgreSQL image (18 in the `railway` package 3.16.0) and declares neither the volume nor the variables, so planning it against the live database would upgrade the server, detach its volume and delete its 12 variables. As a service it keeps the `ghcr.io/railwayapp-templates/postgres-ssl:17` image, mounts `postgres-volume` at `/var/lib/postgresql/data`, and marks every variable the database set (`DATABASE_URL`, `PG*`, `POSTGRES_*`, `SSL_CERT_DAYS`, `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`) `preserve()`, so `apply` keeps the values Railway generated. Stay on 17: the app image's `pg_dump` is version 17 and refuses to back up a newer server.

All three app services build the repository's `Dockerfile` and differ in start command, health check, restart policy and stop window, as the file sets them. The api also runs `sh -c 'node scripts/migrate.ts && node scripts/seed.ts'` as its pre-deploy step.

The api is the only service with the volume, so it runs the jobs that use `/data`: the 03:30 housekeeping of feedback screenshots and the image caches, feedback forwarding to Feishu every 10 minutes, the 04:10 backup, image preparation and content pushes. The worker caches the thumbnails it sends to models and the source icons it checks in its own container, which a redeploy clears. The worker logs one `collect run` line per source fetch and one `model call` line per model request, with the step, model, outcome and cost when the provider reports it.

### Tools

- The Railway CLI 5.42.1 or newer (`npm install -g @railway/cli`; the file was checked with 5.71.0), signed in with `railway login`.
- From the repository root: `npm ci` (it installs the `railway` package the file imports), then `railway link` to the project and its `production` environment.

`npm run typecheck` checks `.railway/railway.ts` against that package's types, so a misspelt setting fails CI.

### Creating the project

1. Create an empty project in the workspace and `railway link` to it.
2. Run `railway config plan`. It should list the creation of `Postgres`, `postgres-volume`, `api-volume`, `api`, `worker` and `web`, and nothing else. Then run `railway config apply`.
3. Set the `Postgres` service's variables. A `ghcr.io/railwayapp-templates/postgres-ssl:17` service gets none by itself, and the file only preserves them. Set `POSTGRES_USER`, `POSTGRES_DB` and a random `POSTGRES_PASSWORD`; `PGDATA` to `/var/lib/postgresql/data/pgdata`, a directory below the mount; the `PG*` variables to the matching values with `PGHOST` `${{RAILWAY_PRIVATE_DOMAIN}}` and `PGPORT` `5432`; and `DATABASE_URL` to `postgresql://${{POSTGRES_USER}}:${{POSTGRES_PASSWORD}}@${{RAILWAY_PRIVATE_DOMAIN}}:5432/${{POSTGRES_DB}}`.
4. Enter the **by hand** values below in each service's Variables. The file declares them with `preserve()`, so `apply` keeps whatever Railway holds and never writes a secret.
5. Deploy the code as in [Deploying a release](#deploying-a-release).
6. Generate a domain for `web` with target port 3000, or add a custom domain, and set `SITE_URL` to that address in all three services.

### Moving existing services onto the file

Railway refuses to plan for services that still read a `railway.json` or `railway.toml`. The services Engineering Lead created from the earlier JSON files need one cutover:

1. Run `railway config migrate status` to list the services still on config-as-code, then `railway config migrate cutover`. It saves the old config-file paths, so `railway config migrate undo` reverses it.
2. Run `railway config plan` and read it before applying. The file names the services `web`, `api`, `worker` and `Postgres`, and the volumes `api-volume` and `postgres-volume`.
   - If the plan would create or delete any of these, the live name differs. Change the name in the file to the live one; `railway config pull` in a scratch clone shows the live names.
   - If the plan would delete a variable you set by hand that the file does not list (an optional one such as `DB_BACKUP_STORE_*`), add it to that service's `env` as `NAME: preserve()`.
   - A volume must never be deleted or recreated: `api-volume` holds uploads and feedback screenshots, and `postgres-volume` holds the database. The plan must not change `Postgres`'s image either.
   - If the plan would delete a `Postgres` variable, add it to the `Postgres` service's `env` as `NAME: preserve()`.
3. Run `railway config apply` once the plan shows only the setting changes you expect.

### Deploying a release

Deploy the api first and wait until it is active, then the worker and web. The api's pre-deploy step migrates the database ([Migrations and deploy order](#migrations-and-deploy-order)).

**Upload with `railway up`.** This is the current path, because Railway's GitHub app cannot see this private repository. Check out the commit whose CI passed, then run:

```bash
railway config apply
railway up --service api --ci
railway up --service worker --ci
railway up --service web --ci
```

`railway up` uploads the working directory and skips files listed in `.gitignore`, so `.env` and `.data/` stay on your machine. Nothing checks CI on this path: deploy only commits whose GitHub checks are green. An upload leaves `RAILWAY_GIT_COMMIT_SHA` empty, so while `source` is unset the file sets `AIHOT_RELEASE` to the checked-out commit (`git rev-parse HEAD`) and `railway config apply` writes it before the upload. Between releases the plan therefore always shows `AIHOT_RELEASE` changing on `api`, `worker` and `web`; that change is expected.

**From GitHub.** Once Railway's GitHub app has access to `chizhangucb/ai-pulse`, set `source` in `.railway/railway.ts` to `github("chizhangucb/ai-pulse", { branch: "main", checkSuites: true })` and apply. Each service then deploys every push to `main`. `checkSuites: true` makes Railway wait for the commit's GitHub checks to pass first, which the dashboard calls **Wait for CI**. The three services deploy in parallel, and the worker waits for the api's migrations on its own.

### Variables

`.railway/railway.ts` sets every value below except those marked **by hand**. Those are secrets or site-specific: enter them yourself in each service's Variables, never in the repository. Make each random secret with `openssl rand -hex 32`. A value entered on two services must be the same in both. `${{...}}` values are Railway reference variables.

Shared by `api` and `worker` (the settings `.env.example` gives, plus the database):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (the private-network address) |
| `AIHOT_DATA_DIR` | `/data` |
| `AIHOT_RELEASE` | The commit: `${{RAILWAY_GIT_COMMIT_SHA}}` when deploying from GitHub, the checked-out commit when uploading. Shown on `/api/health` and the admin Runs page to confirm a release replaced the processes |
| `LLM_BASE_URL` | `https://openrouter.ai/api/v1` |
| `LLM_MODEL` | `anthropic/claude-haiku-5.5` |
| `LLM_EXTRA_JSON` | `{"reasoning":{"enabled":false}}` |
| `LLM_VISION` | `true` |
| `UNDERSTAND_MODEL` | `or-claude-sonnet` |
| `COLLECT_ENABLED` | `true` |
| `MODEL_CALLS_ENABLED` | `true` |
| `FEISHU_CONTENT_PUSH_ENABLED` | `false` |
| `FEISHU_INTERNAL_ENABLED` | `false` |
| `INDEXNOW_SUBMIT_ENABLED` | `false` |
| `LLM_API_KEY` | **by hand**: the OpenRouter key |
| `IMG_PROXY_SIGN_SECRET` | **by hand**: random, the same in both; the worker signs image addresses the api checks |
| `SITE_URL` | **by hand**: the address readers use, without a trailing slash |

`api` only:

| Variable | Value |
|---|---|
| `API_HOST` | `::` (every IPv4 and IPv6 address; Railway's private network can be IPv6 only) |
| `API_PORT` | `3001` |
| `PORT` | `3001`, the port Railway's health check calls |
| `STOP_TIMEOUT_MS` | `30000` |
| `INGEST_RATE_LIMIT` | `10` |
| `RAILWAY_RUN_UID` | `0`: Railway mounts the volume for root, and the image otherwise runs as `node`, which could not write `/data` |
| `ADMIN_PASSWORD` | **by hand**: at least 12 characters |
| `SESSION_SECRET` | **by hand**: random |
| `INGEST_TOKEN` | **by hand**: at least 16 characters; the hourly X job sends it ([X posts through the ingest endpoint](ingest-x.md)) |

`worker` only:

| Variable | Value |
|---|---|
| `STOP_TIMEOUT_MS` | `270000` |

`web` (no database, model or admin secrets):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SITE_URL` | **by hand**: as above |
| `API_BASE_URL` | `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:3001` |
| `WEB_HOST` | `0.0.0.0` |
| `WEB_PORT` | `3000`, the port the server reads |
| `PORT` | `3000`, the port Railway routes the domain and the health check to |
| `TRUST_PROXY` | `true`: Railway's proxy adds the visitor's address to `X-Forwarded-For` |
| `AIHOT_RELEASE` | The commit, as for `api` and `worker` |

Optional settings from `.env.example` (embeddings, paid collection, Feishu, `DB_BACKUP_STORE_*` and so on) go on the service that reads them. Backups run in the api, so `DB_BACKUP_STORE_*` belongs on `api`.

### Stopping

Railway sends SIGTERM, waits the service's `drainingSeconds` from `.railway/railway.ts` (`RAILWAY_DEPLOYMENT_DRAINING_SECONDS`), then kills the process. Keep `STOP_TIMEOUT_MS` about 30 seconds under that window, so the queue can fail the jobs still running for retry and close the database. The worker drains for 270 s in a 300 s window. A service with a volume stops before its replacement starts, so the api drains for 30 s in a 45 s window; an interrupted backup or push is failed and retried by its queue.

## On Render

`render.yaml` at the repository root is a Render Blueprint for the same layout, kept ready so the site can move to Render. It builds the same `Dockerfile` in three roles, plus Render Postgres, all in Oregon. On a Hobby workspace it costs about $59 a month:

| Resource | Render type and plan | Size | Monthly |
|---|---|---|---|
| `ai-pulse-web` | Web service, Starter | 0.5 CPU, 512 MB | $7 |
| `ai-pulse-api` | Private service, Starter, with the 5 GB disk `ai-pulse-data` at `/data` | 0.5 CPU, 512 MB | $7 + $1.25 |
| `ai-pulse-worker` | Background worker, Standard | 1 CPU, 2 GB | $25 |
| `ai-pulse-db` | Postgres 17, Basic-1gb | 1 GB RAM | $19 |

### Creating the services

1. In the Render dashboard, choose **New → Blueprint**, connect `chizhangucb/ai-pulse`, and pick the branch to deploy.
2. Render reads `render.yaml` and lists the database, the environment group `ai-pulse-backend` and the three services. It asks for each **by hand** value below (`sync: false` in the file). Enter them, then **Apply**.
3. Render creates the database, builds the image, runs the api's pre-deploy step (`node scripts/migrate.ts && node scripts/seed.ts`), and starts the services. Each later push deploys only after the commit's checks pass (`autoDeployTrigger: checksPass`).
4. Open the `ai-pulse-web` address; `/api/health` answers once the api is up. For a custom domain, add it to `ai-pulse-web`, then change `SITE_URL` in all three services.

### Variables

`render.yaml` sets everything except the **by hand** values, which Render asks for once. A value set by hand on two services must be the same in both.

Environment group `ai-pulse-backend`, used by `ai-pulse-api` and `ai-pulse-worker`:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `AIHOT_DATA_DIR` | `/data` |
| `LLM_BASE_URL` | `https://openrouter.ai/api/v1` |
| `LLM_MODEL` | `anthropic/claude-haiku-5.5` |
| `LLM_EXTRA_JSON` | `{"reasoning":{"enabled":false}}` |
| `LLM_VISION` | `true` |
| `UNDERSTAND_MODEL` | `or-claude-sonnet` |
| `FEISHU_CONTENT_PUSH_ENABLED` | `false` |
| `FEISHU_INTERNAL_ENABLED` | `false` |
| `INDEXNOW_SUBMIT_ENABLED` | `false` |
| `COLLECT_ENABLED` | `true` |
| `MODEL_CALLS_ENABLED` | `true` |

`ai-pulse-api`:

| Variable | Value |
|---|---|
| `DATABASE_URL` | from `ai-pulse-db`, `connectionString` |
| `API_HOST` | `0.0.0.0` |
| `API_PORT` | `3001` |
| `PORT` | `3001`, so Render's `hostport` names the api's port |
| `STOP_TIMEOUT_MS` | `30000` |
| `INGEST_RATE_LIMIT` | `10` |
| `SITE_URL` | **by hand**: the address readers use, without a trailing slash |
| `ADMIN_PASSWORD` | **by hand**: at least 12 characters |
| `SESSION_SECRET` | **by hand**: random |
| `IMG_PROXY_SIGN_SECRET` | **by hand**: random, the same as on the worker |
| `INGEST_TOKEN` | **by hand**: at least 16 characters |
| `LLM_API_KEY` | **by hand**: the OpenRouter key |

`ai-pulse-worker`:

| Variable | Value |
|---|---|
| `DATABASE_URL` | from `ai-pulse-db`, `connectionString` |
| `STOP_TIMEOUT_MS` | `270000` |
| `SITE_URL` | **by hand**: as on the api |
| `IMG_PROXY_SIGN_SECRET` | **by hand**: as on the api |
| `LLM_API_KEY` | **by hand**: as on the api |

`ai-pulse-web`:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SITE_URL` | **by hand**: as on the api |
| `TRUST_PROXY` | `true`: Render's proxy adds the visitor's address to `X-Forwarded-For` |
| `WEB_HOST` | `0.0.0.0` |
| `WEB_PORT` | `3000`, the port the server reads |
| `PORT` | `3000`, the port Render routes to |
| `API_BASE_URL` | from `ai-pulse-api`, `hostport` (`ai-pulse-api:3001`; the web adds `http://`) |

Optional settings from `.env.example` go into the `ai-pulse-backend` group, or onto the one service that reads them; `DB_BACKUP_STORE_*` belongs on the api.

### Stopping

Render sends SIGTERM and waits `maxShutdownDelaySeconds` (at most 300) before killing the process. As on Railway, the worker drains for 270 s in 300 s, and the api, whose disk stops it before its replacement starts, drains for 30 s in 45 s.

## Migrations and deploy order

Each service deploys on its own: on Render once a push passes CI; on Railway in the order you run `railway up`, or, deploying from GitHub, all three in parallel once the checks pass:

1. The api's pre-deploy step migrates and seeds in a separate container, while the old api, worker and web keep running. If it fails, the api deploy stops and the old api stays.
2. Then the old api stops and the new one starts; the site answers errors for that short gap, because a service with a volume or disk cannot overlap with its replacement.
3. The worker and web deploy at the same time, in any order. A new worker that starts before the api's migrations finish waits until they are applied, logging `waiting for migrations`. Web reads the database only through the api.

So every release must work with the previous release's code still running against its new schema, and with web and api one release apart for a few minutes:

- Migrations only add: new tables, nullable columns or columns with a constant default, `NOT VALID` constraints, concurrent indexes. The online migration check in CI enforces the statement rules from `0055` on ([Database migrations](architecture.md#database-migrations)).
- Removing or renaming anything (a column, a table, a type change) takes two releases: first a release whose code no longer reads or writes it, deployed to all three services; then the release with the destructive migration.
- An api route the web calls keeps its old shape for one release.
- A release that cannot follow these rules is deployed by hand: stop the worker and web (on Railway, remove their active deployments; on Render, suspend them), deploy the api, then bring the other two back on the new release.

The migration waits for a running backup's `pg_dump` for the api's `STOP_TIMEOUT_MS` (30 s) and then fails the deploy. Avoid deploying around the 04:10 backup (site time), or deploy again once it ends.

## Moving between Railway and Render

The data is the Postgres database and two directories on the api's `/data`: `uploads/` and `feedback-screenshots/`. The image and share-image caches rebuild themselves, and `backups/` holds only local copies.

1. Create the services on the new host as above, with the same `SESSION_SECRET` and `IMG_PROXY_SIGN_SECRET`, so admin sessions and signed image addresses stay valid. Do not open the new site yet.
2. Stop the worker and the api on the old host, so nothing writes while you copy.
3. Copy the database with a PostgreSQL 17 client, from the old database's external address to the new one's (Railway's `DATABASE_PUBLIC_URL`; Render's External Database URL):
   ```bash
   pg_dump --format=custom --no-owner --file ai-pulse.dump "$OLD_DATABASE_URL"
   pg_restore --no-owner --dbname "$NEW_DATABASE_URL" ai-pulse.dump
   ```
   Restore into the new, empty database before its api first deploys. The api's pre-deploy migration then finds every migration recorded and changes nothing.
4. Copy the files from the old api's shell (`railway ssh --service api`, or the Render shell of `ai-pulse-api`) to the new one's:
   ```bash
   tar -czf - -C /data uploads feedback-screenshots > ai-pulse-files.tar.gz   # on the old api, then download it
   tar -xzf ai-pulse-files.tar.gz -C /data                                    # on the new api, after uploading it
   ```
   With `DB_BACKUP_STORE_*` set, the latest backup's `.dump` and `-files-` archive are the same two pieces ([Backups](#backups)).
5. Deploy the new api, then the worker and web, point the domain at the new web, and set `SITE_URL` if the address changed. Delete the old services once the new site works.

## What it costs

- **Models**: every new item is pre-screened once; items that pass are scored twice, structured once and given a title and summary once, then grouped (calling the model only when there are similar reports); there are also story overviews, weekly and monthly overviews, and full translations of non-English picks. X posts with empty text or only links call no writing or translation model. Daily briefs are put together by rule without a model. In a local trial run on the demo sources, the first import of 152 items took about 930 model calls. Daily use after that depends on how many items your sources publish. The admin's Models and evals page shows each step's calls, input and output tokens, and the actual cost OpenRouter reports for each call.
- **Paid collection** (X, WeChat, Jina): billed per request, off by default, used only once a key is set.
- Every paid service has per-minute, per-hour and per-day call limits (admin Settings → Paid request limits), past which it pauses, so a bill cannot explode overnight. 0 stops the service at once.

## Without Docker

You need Node.js 24.11 or later and PostgreSQL 16 or 17, on Linux or macOS; on Windows, run it in WSL2 or use Docker as above.

```bash
npm ci
node scripts/init-env.ts --llm-key <your OpenRouter key>
createdb aipulse
```

Add to `.env`:

```bash
DATABASE_URL=postgres://your-user-name@127.0.0.1:5432/aipulse
API_BASE_URL=http://127.0.0.1:3001
```

Then:

```bash
node --env-file=.env scripts/migrate.ts
node --env-file=.env scripts/seed.ts
npm run build -w @aihot/web

NODE_ENV=production node --env-file=.env apps/api/src/main.ts          # API, port 3001
NODE_ENV=production node --env-file=.env apps/worker/src/main.ts       # background jobs
cd apps/web && NODE_ENV=production node --env-file=../../.env server.ts   # pages, port 3000
```

All three processes need `NODE_ENV=production`. Without it, the api and worker run as development: production secrets and the admin password are not checked at start, and the `DEV_AUTH_ROLE` sign-in bypass works.

The three processes must keep running; in production, supervise them with systemd or pm2 (with `NODE_ENV=production` in that config too). Give the worker 315 seconds to stop (`TimeoutStopSec=315` for systemd; `kill_timeout: 315000` and `treekill: false` for pm2), covering the queue's 270-second drain (`STOP_TIMEOUT_MS`) and database cleanup, and give the api the same, or a shorter `STOP_TIMEOUT_MS` with 15 seconds more to stop; systemd also needs `KillMode=mixed`, so only the main process is told to stop taking jobs and a running `pg_dump` or `tar` backup finishes on its own. A call killed early has an unknown outcome and is retried only after it is released automatically, at least half an hour later.

For development, use the hot-reloading commands `npm run dev:api`, `npm run dev:worker` and `npm run dev:web`. To enter the admin without signing in while developing, set `DEV_AUTH_ROLE=admin` in `.env` (production refuses to start with it).
