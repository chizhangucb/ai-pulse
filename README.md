# AI Pulse

AI Pulse reads the main AI sources, picks the news worth your time, groups reports of the same story, and publishes a daily brief every morning at 08:00 Pacific time. It is an English-language site, and every date and schedule on it is in Pacific time (America/Los_Angeles).

AI Pulse is built on [AIHOT](https://github.com/KKKKhazix/AIHOT), an open-source AI news engine released under the MIT License by 数字生命卡兹克 (Digital Life Khazix). AI Pulse is an independent site. It is not affiliated with AIHOT and does not use the AIHOT name or logo. See [Credits and license](#credits-and-license).

## What it does

1. **Collect.** The demo configuration watches 36 feeds (official blogs, research labs, news sites, newsletters and GitHub release feeds) and 98 X accounts. Busy sources are checked more often, as often as every 15 minutes.
2. **Store.** Everything collected is kept. Reports of the same story from different sources are grouped into one story, and the trending list is built from those stories.
3. **Pick.** A model first checks that an item is about AI and has real news in it. Items that might matter are scored twice, independently, against a threshold set by the source's tier. The model then writes a plain title, a short summary and why it matters. Marketing and reposts do not get in.
4. **Publish.** A daily brief every day at 08:00 PT, a weekly brief every Monday at 10:00 PT and a monthly brief on the 1st at 10:30 PT. The daily brief covers the 24 hours before it.

Readers get the same content on the website, over RSS, a public API, MCP and Agent Markdown. Opening a page never calls a model; models run only in the worker's jobs.

## Run it

You need [Docker](https://docs.docker.com/get-started/get-docker/), [Node.js 24](https://nodejs.org/en/download) to run `init-env`, and an [OpenRouter](https://openrouter.ai/keys) API key.

```bash
git clone https://github.com/chizhangucb/ai-pulse.git
cd ai-pulse
node scripts/init-env.ts --llm-key <your OpenRouter key>
docker compose up -d --build
```

Open <http://localhost:3000>. The admin is at `/admin`, and the admin password is `ADMIN_PASSWORD` in `.env`. Content starts to appear after a minute or two.

`init-env` writes `.env` from `.env.example` with random secrets. Every step uses OpenRouter with `anthropic/claude-haiku-5.5` by default, with reasoning turned off (`LLM_EXTRA_JSON={"reasoning":{"enabled":false}}`), so each step's output budget goes to the answer. To give one step another model, set one of the presets in `site/models.ts` (see the comments in `.env.example`). Model calls are logged with OpenRouter's reported cost and are stopped by per-service budget limits under admin Settings.

X posts are not fetched by the site. An external job pushes them to `POST /api/ingest/items` once an hour; see [X posts through the ingest endpoint](docs/ingest-x.md).

To run without Docker, put the site behind a domain with HTTPS, or upgrade an existing install, see [Deployment](docs/deploy.md).

## Checks

```bash
npm run typecheck
DATABASE_URL=postgres://127.0.0.1:5432/aipulse_test npm test   # the database name must end in _test or _ci
npm run build -w @aihot/web && node --test apps/web/tests/*.test.ts
node scripts/smoke.ts --base http://localhost:3000             # once the site is running
node scripts/check-sources.ts                                  # fetches every demo source, stores nothing
```

## Where things are

| Path | What it holds |
|---|---|
| `site/` | Site name and copy (`site.ts`), the model for each step (`models.ts`), brand and logo, terms and privacy pages, files served from the site root, changelog |
| `industry/` | Categories and tags (`taxonomy.ts`), topics, demo sources (`sources.json`), X accounts (`x-accounts.json`), prompts (`prompts/`), selection thresholds (`selection.ts`) |
| `apps/` | The web front end, the API and the worker |
| `packages/` | Shared contracts and the backend: collection, analysis, grouping, publication, reports |
| `modules/` | Site-specific features built as modules |
| `docs/` | The documentation below |

## Documentation

| Document | Contents |
|---|---|
| [Customize](docs/customize.md) | Site name, categories, topics, sources, prompts, thresholds, models and brand, step by step |
| [Sources](docs/sources.md) | The six kinds of sources, tiers and full text, fetch frequency, older articles, the push interface |
| [X posts through the ingest endpoint](docs/ingest-x.md) | Pushing X posts to the site |
| [Selection and calibration](docs/selection.md) | How an item becomes a pick and goes into the briefs, and how to calibrate with labelled samples |
| [Story grouping](docs/grouping.md) | How reports are grouped into stories, and how to evaluate grouping |
| [Story digest evaluation](docs/story-digest-evaluation.md) | Comparing story overview prompts on the same stories |
| [Deployment](docs/deploy.md) | Docker, domains and HTTPS, updates, backups, costs, running without Docker |
| [Architecture](docs/architecture.md) | Processes, rules that do not change, directories, modules, migrations, public outputs, tests |

Stack: Node.js 24, TypeScript, React Router (server-side rendering), Fastify, PostgreSQL, pg-boss, Tailwind CSS, Docker Compose.

## Credits and license

AI Pulse is derived from [AIHOT](https://github.com/KKKKhazix/AIHOT), Copyright (c) 2026 数字生命卡兹克 (Digital Life Khazix), released under the MIT License. The engine, the admin, the selection pipeline, the grouping and heat algorithms and most of the documentation come from AIHOT. Thank you to its author for publishing it.

The code is under the [MIT License](LICENSE); keep the license text with any copy. The AIHOT name and logo are not covered by the license and are not used here. Fonts and other third-party material have their own licenses; see [NOTICE](NOTICE).
