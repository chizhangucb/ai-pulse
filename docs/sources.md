# Sources

Sources are managed on the admin's Sources page: create one, preview a fetch to see what it gets, change its interval, pause or resume it, and see why it fails and its latest items. On first start, the demo sources in `industry/sources.json` are imported.

## Six kinds of sources

| Kind | For | Needs |
|---|---|---|
| `rss` | Blogs, media, Substack and RSS bridges with RSS or Atom | Nothing |
| `web_list` | Web listings without RSS (news pages, blog indexes, changelogs) | Selectors; Jina Reader rendering where needed (billed per call) |
| `json_list` | APIs returning JSON | Field paths |
| `x_search` | X (Twitter) accounts | A SocialData key, billed per request |
| `mp_account` | WeChat official accounts | A Dajiala key, billed per request |
| `external` | Content your own scripts push in | `INGEST_TOKEN`; see below |

A `json_list` address or config may carry credentials, so it follows only same-origin redirects (same scheme, host and port). If an API moves to another origin, update the source's address; do not rely on cross-origin redirects to pass authentication.

Fetching never reaches private network addresses by default. When a feed or listing address points to a service on your private network (say RSSHub in the same Docker network, at `http://rsshub:1200/...`), set `PRIVATE_FEED_HOSTS=rsshub` in `.env` (comma-separated full host names, case-insensitive) and restart the API and worker. The exception applies only to the `feedUrl` of `rss` and the `url` of `web_list` and `json_list` themselves, and those hosts are reached directly, not through `EGRESS_PROXY_URL`. Redirects to other hosts, article bodies, detail pages, images and icons still refuse private addresses, and link-local and cloud metadata addresses (`169.254.0.0/16`, `100.100.100.200` and so on) are always refused.

The config keys each kind accepts are in [`config-keys.ts`](../packages/backend/src/sources/config-keys.ts). A key it does not know is refused on save, and fetching fails outright with the reason shown in the admin, instead of quietly falling back to the generic parse.

To check whether the sources in `industry/sources.json` return items: `node --env-file=.env scripts/check-sources.ts` (optionally a file path and `--only id,id`). It runs the same code as the admin's "Preview fetch", stores no items and calls no model, and exits with code 1 when a source fails or returns nothing.

## Preview first, then create

Go to `/admin/sources/new`, fill in the ID and name, choose the kind, and put the JSON from [the next section](#configuring-each-kind) into "Collection config (JSON)". It is the config object itself, not wrapped in `kind` or `config`. Changing the kind resets the config, so choose the kind before pasting.

A note in full-width parentheses in a name (such as "Some Outlet（trending RSS）") is for the admin only: readers see the name without it on pages, RSS, Agent Markdown, MCP and search. For an X account named `X: Display name (@handle)`, readers see only the display name. The public API's JSON keeps the full name.

`rss`, `web_list`, `json_list` and `x_search` can "Preview fetch": it shows the item count and the first 20 items' titles, links, publication times and summaries, without storing them. Check that it found articles rather than navigation and that the dates match the originals, then press "Create". Preview and real collection apply the same filters (address prefixes and patterns, categories, noise words, address rewrites, `publishedAfter`), so what you see is what collection would take. It is not a finished production collection, though, and skips the later detail fill-in, picking and publishing.

Preview still sends fetch requests; X and Jina previews may cost money and go through paid receipts and budgets. `COLLECT_ENABLED=false` turns off only automatic collection and does not keep a manual preview from reaching outside services. The local HTML/JSON example below needs no API key.

## Configuring each kind

### rss

```json
{ "feedUrl": "https://example.com/feed.xml" }
```

Optional:

- `summaryIsBody`: when the feed's summary is known to be the full text, RSS `description` and Atom `summary` are used as the body instead of fetching the article page.
- `allowCategories` / `denyCategories`: filter by the feed's categories.
- `atomUpdatedIsPublished: true`: read an Atom entry's `updated` as its publication time when it has no `published`. GitHub's `releases.atom` needs it (its entries carry only `updated`, which is when the release came out). Other feeds change `updated` when they revise an entry, so keep it off there.

No source extracts YouTube or Vimeo player pages as article bodies. A Media RSS video description is kept as a summary and never taken as a transcript, even with `summaryIsBody`; real text a feed gives in `content` / `content:encoded` is still used. A video embedded in another article does not affect reading that article's body.

Native video in article bodies keeps safe media addresses and candidate formats and plays manually with the browser's controls. The browser fetches the video file straight from the original site, and the poster goes through the image proxy; nothing autoplays or loops, and the preload hint is `none`, though browsers do not promise no request before interaction. A player with no media address and no usable poster keeps only its fallback text. Markdown and redistributable full-text RSS keep the video structure, and whether it plays depends on the reader app; dynamic platform players and iframes are not covered.

An inline SVG chart inside an article figure does not keep the graphic itself (its colors and fonts depend on the original site's stylesheets). It is replaced by the accessible text the site wrote for it (`aria-label`, the text `aria-labelledby` points to, or the chart's `<title>` and `<desc>`), as plain text where the chart was; of a chart's wide and narrow versions only one is kept, and text the figure already shows (captions, small headings) is not repeated. Charts without such text and SVG icons outside figures are removed as before.

A podcast episode with no web page (no `<link>`, and a `guid` that is not an address) links to its audio or video file, which a browser can play; such episodes fetch no page and are handled from the feed's text.

### web_list

Ordinary CSS selectors work, and `div` lists can be collected. The key is that `itemSelector` selects **each story**, not the container around all of them. For example:

```html
<div class="news-list">
  <div class="news-item">
    <h2><a href="/posts/first">First example story</a></h2>
    <time datetime="2026-10-01T09:00:00-07:00">Oct 1</time>
  </div>
  <div class="news-item">
    <h2><a href="/posts/second">Second example story</a></h2>
    <time datetime="2026-10-01T10:00:00-07:00">Oct 1</time>
  </div>
</div>
```

The matching config (`example.com` is a placeholder for the target page; a runnable version is in [the local example](#running-the-htmljson-example-locally)):

```json
{
  "url": "https://example.com/news",
  "parseMode": "html",
  "itemSelector": ".news-list > .news-item",
  "linkSelector": "h2 a",
  "titleSelector": "h2 a",
  "publishedAtSelector": "time",
  "allowUrlPrefixes": ["https://example.com/posts/"]
}
```

- `itemSelector` finds items in the whole page; `linkSelector` and `titleSelector` take the first match inside each item, which may be the item itself. Selecting `.news-list` gives one container and usually only the first story; selecting plain `div` mixes in nested containers. Select the node that repeats for each story.
- Links come from `href`; relative links such as `/posts/first` resolve against the listing's final address after redirects, or against `baseUrl`. Titles are the node's text. Duplicate links merge; when a Markdown list shows a "Read more" button before the real title, the real title wins. Links to the listing itself are usually skipped.
- Dates are looked up in the item with `publishedAtSelector`, trying the `datetime`, `content` and `title` attributes and then the text; hint text that cannot be parsed does not hide a valid date on the same node. A date and time without a zone can use `publishedAtUtcOffset` (unset, it is read in the site's zone `SITE.timeZone` at that date's offset, daylight saving included); a time with its own zone keeps that zone, and a bare `YYYY-MM-DD` is read as UTC midnight. Partial months, product version numbers and dates that do not exist are not taken as publication dates.
- `parseMode`: `html` by default for ordinary pages; `markdown` reads Markdown links; `docusaurus_changelog` reads changelog headings; `intercom_changelog` reads the dated sections of an Intercom help center as titles and bodies, each section keeping its own address anchor, read as UTC calendar days by default or with `publishedAtUtcOffset`. To use Jina, write `url` as `https://r.jina.ai/https://target-site/path` explicitly and set `JINA_API_KEY`; it does not switch over by itself when a fetch fails. Jina returns Markdown by default; to keep using CSS selectors, set `parseMode: "html"` explicitly.
- `detail`: fetch detail pages to fill in a date, title or summary the listing lacks (`publishedAtSelector`, `titleSelector`, `summarySelector` and so on). Items whose read failed or that ran past this round's `maxFetches` are filled in by later fetches; filling metadata keeps a confirmed body. A real title already stored is not changed back to button text because the listing still says "Read the Blog", and is not read again just because it is long. Set `titleAuthoritative: true` to always use the detail page's title. When the detail page or body extraction reads a time without a zone, it uses `detail.publishedAtUtcOffset`, then the source's `publishedAtUtcOffset`, then the site's zone. RSS and JSON lists can use `detail` too.
- With a Jina listing, `detail.titleRegex` and `publishedAtRegex` match Jina's text and can share one detail response; CSS selectors read the original site's HTML. Choose by the page you can actually read.
- `allowUrlPrefixes` / `denyUrlPrefixes`: collect only articles under certain paths.
- `denyUrlPattern`: a regular expression; matching links are left out (every kind that reads a listing). For example `"/releases/tag/[^/]*[\\d.-]rc\\.?\\d*$"` drops a GitHub release feed's release candidates, whose rc mark can be in the tag only (Ollama titles its `v0.40.9-rc1` release just "v0.40.9").

### json_list

Suppose an API returns the structure below. `itemsPath` points to the array, and the other field paths are relative to **each array element**. Paths are dot-separated, not JSONPath: no `$` or `[*]`.

```json
{
  "data": {
    "items": [
      {
        "id": "first",
        "title": "First example story",
        "url": "https://example.com/posts/first",
        "summary": "Summary of the first story.",
        "published_at": "2026-10-01T09:00:00-07:00"
      }
    ]
  }
}
```

The matching config:

```json
{
  "url": "https://example.com/api/news",
  "mode": "json_api",
  "itemsPath": "data.items",
  "titlePaths": ["title"],
  "urlTemplate": "{raw:url}",
  "summaryPaths": ["summary"],
  "publishedAtPath": "published_at",
  "externalIdPath": "id"
}
```

- When the API returns an array itself, leave out `itemsPath`. `titlePaths`, `summaryPaths` and `authorPaths` are arrays of candidate paths, and the first non-empty value wins, for example `["title", "name"]`.
- With a full address use `{raw:url}`; with only a slug, `https://example.com/posts/{slug}`. `{field path}` encodes the value and `{raw:field path}` inserts it as is. JSON lists do not turn relative addresses into absolute ones, so the template must produce a full HTTP(S) address.
- `summaryIsBody`: set `true` when the API's summary is known to be the full text, so the text from `summaryPaths` is the body and the article page is not fetched.
- Dates are best returned as ISO strings with a zone. A time without one, like `2026-09-30 17:43:58`, is read with `publishedAtUtcOffset` as for web lists (unset, in the site's zone); numeric timestamps need `publishedAtUnit: "epoch_s"` (seconds) or `"epoch_ms"` (milliseconds), and dates like `20261001` need `"yyyymmdd"`.
- Items without a title or a buildable link are skipped. When a non-empty array maps to nothing, the error is `no items mapped (check title/url paths)`; when the path is not an array, `items path did not resolve to an array`.

### Running the HTML/JSON example locally

The repository has two made-up examples, [news.html](examples/sources/news.html) and [news.json](examples/sources/news.json), with two stories each. They are for checking selectors and field mapping, not real sources; the example article links have no body.

Run this from the repository root with Node.js 24.11 or later. The server listens only on this machine and serves only these two files; stop it with `Ctrl+C`.

```bash
node --input-type=module -e '
import http from "node:http";
import { readFileSync } from "node:fs";
const files = {
  "/news.html": ["text/html; charset=utf-8", readFileSync("docs/examples/sources/news.html")],
  "/news.json": ["application/json", readFileSync("docs/examples/sources/news.json")]
};
http.createServer((req, res) => {
  const file = files[req.url];
  res.writeHead(file ? 200 : 404, { "content-type": file ? file[0] : "text/plain" });
  res.end(file ? file[1] : "Not found");
}).listen(8787, "127.0.0.1");'
```

On the same machine, set up the database as for the [deployment without Docker](deploy.md#without-docker), run the development API and web with `npm run dev:api` and `npm run dev:web`, keep the collection, model, Feishu and IndexNow switches off, and do not start the worker. For this local example only, set `ALLOW_PRIVATE_NETWORK_FETCH=true` for the development API process and restart it; fetching private addresses is refused by default, production refuses to start with it, and you should remove it afterwards. If the API runs in a container or on another server, `127.0.0.1` points to that machine and these addresses do not work there as they are.

Choose `web_list` and then `json_list`, paste each config and press "Preview fetch"; there is no need to create a source:

```json
{
  "url": "http://127.0.0.1:8787/news.html",
  "parseMode": "html",
  "itemSelector": ".news-list > .news-item",
  "linkSelector": "h2 a",
  "titleSelector": "h2 a",
  "publishedAtSelector": "time",
  "allowUrlPrefixes": ["http://127.0.0.1:8787/posts/"]
}
```

```json
{
  "url": "http://127.0.0.1:8787/news.json",
  "mode": "json_api",
  "itemsPath": "data.items",
  "titlePaths": ["title"],
  "urlTemplate": "http://127.0.0.1:8787/posts/{id}",
  "summaryPaths": ["summary"],
  "publishedAtPath": "published_at",
  "externalIdPath": "id"
}
```

Both should show **2 items**, as in the table below. The JSON example also shows each summary; the HTML example configures no summary. The preview API's dates are UTC, and the admin shows them in the site's zone (09:00 and 10:00 Pacific time on AI Pulse).

| Title | Link | publishedAt in the preview API |
|---|---|---|
| First example story | `http://127.0.0.1:8787/posts/first` | `2026-10-01T16:00:00.000Z` |
| Second example story | `http://127.0.0.1:8787/posts/second` | `2026-10-01T17:00:00.000Z` |

Try changing the HTML `itemSelector` to `.news-list` for comparison: it returns only the first story. Changing it back to `.news-list > .news-item` brings back both. That is the difference between the list container and each story.

For a real page, first check whether the raw HTTP response contains the story nodes. The plain HTML mode runs no JavaScript; content you see in a browser but not in the response cannot be produced by another CSS selector. Look for RSS or a JSON API first, or use Jina or your own external collection where needed. `no items matched (html)` can also mean a selector does not match, an item has no `href` or title, or a prefix rule filtered the link; check the response and the config before changing the collector.

### x_search

These sources search through SocialData; you do not put an X profile URL into a web list. For `https://x.com/SomeAccount`, take the user name `SomeAccount`, without `@` or the URL:

```json
{ "query": "from:SomeAccount -filter:replies", "searchType": "Latest" }
```

`SomeAccount` is a placeholder for the real account to follow. `-filter:replies` leaves out replies; `Latest` searches the newest posts.

Set `SOCIALDATA_API_KEY` in the backend's `.env` and restart the API (for previews) and the worker (for scheduled collection); never put the key in a source's JSON or commit it. Check the SocialData limits under admin Settings → Paid request limits before previewing. Without a key the error is `SOCIALDATA_API_KEY is not configured`; when the service refuses a request or a budget breaker trips, read the reason in the admin. A preview may make paid requests, and its result depends on the account and what the service returns at the time.

In production, ordinary accounts are merged into one search (twenty-some accounts at most each time) to save requests; a manual preview of one source is not merged.

AI Pulse does not use `x_search` for its X accounts. Their posts are pushed by an outside job; see [X posts through the ingest endpoint](ingest-x.md).

### mp_account

```json
{ "ghid": "gh_xxxxxxxx", "nickname": "Account name" }
```

Each account is checked once per interval (listing is billed per call), and new articles' bodies come with it.

Set `DAJIALA_KEY` in the backend's `.env`, and use the account's original ID as `ghid`. The config fields are `ghid` / `nickname` as above, not `biz` / `name`. `mp_account` has no "Preview fetch" for now; `external` cannot be fetched either and is connected through the push interface below.

## Tiers, participation and full text

- **Tier** `tier`: `T1` official first party (sites, official blogs, institutions), `T1_5` official accounts and near-official creators, `T2` media and individuals, `EXCLUDE_MP` not picked. Thresholds differ by tier (`industry/selection.ts`).
- **Participation** `participation_mode`: `editorial` goes into picks and all news; `hot_signal` is never shown on its own and counts only as heat evidence of what people are discussing; `isolated` appears on no public page.
- **First party**: only `T1` is first party; there is nothing else to set. When a piece of news has several reports, the first-party one is preferred as the representative, and story pages show first-party reports first.
- **Publisher** (optional, in `config`):
  - `publisherUrlPrefixes`: the address prefix of a `T1` source's own articles, such as `["https://example.com/blog/"]`. Articles at those addresses brought in by other sources (aggregators, reposts) are credited to it when it is the only official source that matches. For a web list source without it, the path of its own listing counts (and the article must have appeared in its listing).
  - `publisherRole`: the role of a `T1_5` account, `organization` (an institution's official account) or `person` (an official of it). With the source's `owner_entity_id` set as well (an `ENTITIES` id in `industry/taxonomy.ts`), news the account posts whose subject is that company can be the representative report (after `T1`).
- **Full text**: `site_fulltext` decides whether the site shows the full text, and `syndicate_fulltext` whether the full-text RSS carries the body. Both are **off by default**, showing only the summary and a link to the original; turn them on when the source clearly allows it. WeChat and paywalled content does not get full-text display just because it can be fetched.

## Fetch frequency

Each source has its own fetch interval. Every day at 04:20 (site time) it adjusts to the last 7 days' output: busier sources are fetched more often, at most every 15 minutes (60 for web lists read through Jina); at the least, every 60 minutes for ordinary sources, 120 for X accounts and web lists read through Jina, and 180 for heat-only sources. X accounts in merged searches follow the merged pace: every half hour for editorial ones, hourly for heat-only ones.

A failed fetch does not move the position, so the next one continues from the same place. Sources failing in a row are marked red in the admin, and every Monday a weekly source report goes to the operations group (when an internal Feishu group is configured).

"No new content in 7 days" is judged by **the source's own pace**, not a fixed window, and the daily and weekly reports list two kinds. **Past its own pace** comes first, to check against the original site: the last 90 days' **output days** are deduplicated to days, and the median gap between consecutive days is its pace; it needs at least 4 such days to have a pace, and a silence counts only past 4 times the median gap. An output day is the item's publication time, or the day we found it when the page gives none; **a first import counts as one day**, since it is one delivery however far back its publication times reach (otherwise a source that never produced would look punctual, and a first import spanning months would stretch the median and hide a source that has gone quiet). The window counts only output days in those 90 days, since older history says nothing about how often it posts now; discovery and publication times come in no fixed order, either one in the window counts, and the output day is then clamped to the window. **Sources whose pace cannot be judged are still listed**, but not as faults, in two kinds: no comparable output in the window (it produced, but only outside the window), and never received anything (a collection problem). Sources within their own pace are not listed. The fetch interval `interval_minutes` plays no part: it says how often we look, not how often the source posts.

## Rule: old articles don't flood the site

Material whose original was published more than 48 hours before we first found it, the existing backlog of a new source's first import, and pushes marked as backfill are archived by their original time: not in "today", never pushed. Material with no trustworthy publication time is not made public (not in public lists, picks, briefs, trending or pushes) until a date is read from the source or the article page. Every entrance shares this rule, so a one-time import of history cannot flood the site.

A new source's first import takes only the first `_aihot.initialBackfillLimit` items of the listing (30 by default) within `_aihot.initialBackfillMonths` months (12 by default). Later fetches take only items published within 48 hours before the source's first import or later, so older backlog in the listing never comes in and you never pay for a whole feed archive; items published after the first import are collected wherever they sit in a long listing. Listing items without a publication time are collected and wait for a date as above. X accounts read onward from their fetch position and are not limited by this.

To watch only from a fixed time on, set `publishedAfter` in an RSS, web list or JSON config, for example `"2026-10-01T00:00:00.000Z"`. It must be a complete UTC time (milliseconds optional); previews, the first collection and later ones accept only items published **strictly after** it with a trustworthy date, and unknown dates are excluded too. On a single-page changelog whose sections on the starting day keep the same publication date, content appended later is not taken either; keep that in mind when choosing the start.

## The push interface

Content your own scripts collect can be pushed into the site, and goes through the same duplicate check, picking and grouping as ordinary collection.

```
POST /api/ingest/items
Authorization: Bearer <INGEST_TOKEN>
Content-Type: application/json

{
  "sourceId": "my-crawler",
  "sourceName": "My crawler",
  "items": [
    { "title": "required", "url": "required", "text": "optional", "publishedAt": "2026-10-01T08:00:00-07:00", "author": "optional" }
  ]
}
```

- Set `INGEST_TOKEN` in `.env`, at least 16 characters; without it the endpoint always returns 401.
- At most 50 items per request; more returns 413. `INGEST_RATE_LIMIT` sets how many pushes each client may make per minute: 10 by default with `docker compose`, past which it returns 429 (with `Retry-After: 60`); without Docker there is no limit by default, so set one in `.env` unless a reverse proxy in front limits pushes, and 0 means no limit.
- `text` (or `body`) is the item's text, and the model judges the item on it without fetching the page. Without it the site fetches the page first, except for x.com and twitter.com addresses, which cannot be fetched: there the title is the text ([X posts through the ingest endpoint](ingest-x.md)).
- It returns `{"ok": true, "created": <new items>}`. Items that are not JSON objects, or lack a title or address, are skipped, and a repeated address in one request counts once.
- An unknown `sourceId` creates an `external` source that stays off public pages: set its participation to `editorial` in the admin for it to appear on the site.
- After a source is paused in the admin, the push endpoint returns 409 and takes no new articles; resume the source to push again.
- An item with `raw._aihot.backfill` set to `true` is handled as backfill (not in "today", never pushed).
