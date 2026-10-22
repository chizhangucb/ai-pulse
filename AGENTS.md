# Notes for agents

This is a framework for an industry news site: it collects sources, uses models to screen and write, groups items into events, produces daily, weekly and monthly reports, and serves them through the website, RSS, a public API, Agent Markdown and MCP. The default configuration is an example site for the AI industry. Read the README first, then the documents in `docs/` that match your task.

## The most common task: switching to another industry

Follow the order in `docs/customize.md`. What belongs to this site is in `site/`: the site name and copy (`site.ts`), the model for each step (`models.ts`), brand and logo (`brand/`), terms pages (`pages/`), the fixed files published at the site root (`public/`, published with their placeholders filled in) and the changelog (`changelog.json`). Industry knowledge is in `industry/`: categories and tags (`taxonomy.ts`), topics (`topics.json`), demo sources (`sources.json`), prompts (`prompts/`) and thresholds (`selection.ts`). You usually do not need to change `apps/` or `packages/`. A feature the framework lacks and only this site needs becomes a module in `modules/` ("Modules" in `docs/architecture.md`).

Ask the user these things instead of deciding for them: the site name; which sources to follow; what news matters and what is noise; how to divide the categories; the content of the terms and privacy pages (`site/pages/` are templates that the user must confirm before going live).

When you change the scoring rubric, keep its structure (content types, five weighted dimensions, noise suppression, safety limits) and replace the examples of "what counts as important" and "what counts as noise". Recalibrate the thresholds with samples the user has labeled (`docs/selection.md`); do not change the numbers by feel.

## Running and checking

- Node.js 24 runs TypeScript directly; the backend has no build step. npm workspaces: `apps/*`, `packages/*`, `industry`, `site`, `modules/*`.
- Running locally and with Docker is in `docs/deploy.md`.
- After a change, run at least:
  ```bash
  npm run typecheck
  DATABASE_URL=postgres://127.0.0.1:5432/<name>_test npm test   # the name must end in _test or _ci; it is created and migrated if missing, so the account must be able to create databases
  npm run build -w @aihot/web && node --test apps/web/tests/*.test.ts
  node scripts/smoke.ts --base http://localhost:3000             # once the site is running
  ```
- Some tests in `tests/` use the example industry's categories, tags and companies. After changing `industry/taxonomy.ts`, replace those examples with the matching items of the new industry.

## Rules to keep

- The frontend (`apps/web`) reads `apps/api` only over HTTP; the database, model calls and secrets stay in the backend.
- Every public output reads from the one read layer in `packages/backend/src/publication/`, and so does any new public output.
- A reader opening a page never triggers a model call; models are called only in worker jobs.
- Every paid request goes through receipts (`providers/receipts.ts`) and the budget circuit breaker; do not bypass them.
- A safety valve is open only when set to `true`. Keep these off during development: `COLLECT_ENABLED`, `MODEL_CALLS_ENABLED`, `FEISHU_*_ENABLED`, `INDEXNOW_SUBMIT_ENABLED`. In tests pushing is always off, and collection and model calls go only to local fake services, never to an external service.
- A source shows only a summary and the link to the original by default (`site_fulltext` off); turn full text on only when the source clearly allows it.
- Public content is anonymous: an admin and a visitor see the same thing. The admin area is for admins only.
- When you retire or replace a feature or mechanism, delete its code, tests, docs and stored state (tables and columns, scheduled jobs, settings, environment variables and their entries in `.env.example`) in the same change; if that deletes data users already have, say so in the update notes in `docs/deploy.md`. Locks, retries, compatibility with old formats, switches and fallbacks need evidence first: it happened in a real deployment, or the platform's semantics make it certain to happen.
- Database migrations go in `database/migrations/` (tables that belong to one module go in its `migrations/`), and run and are recorded in order of their full file names; different files with the same number each run, a new migration uses a new file name, and a released migration is never changed. From `0055` on, each file holds one statement that is safe to run online, and the PR checks this; indexes use `CONCURRENTLY IF NOT EXISTS`, and large data backfills stay out of release migrations. Design constraint validation and destructive changes by the [migration rules](docs/architecture.md#database-migrations) first; never edit history files or turn the check off to get around it.
- Never commit `.env`, secrets or `.data/`.
- Do not use the AIHOT name or logo.

## Writing code

Match the style, naming and comment density of the surrounding code. Choose the simple solution that clearly solves the problem, and define only abstractions that are in use. Verify the important behavior a change touches; do not write tests for simple style changes.

## Sending a PR to this repository

To send a change back to `KKKKhazix/AIHOT`, read `CONTRIBUTING.md` first. These are the cases most often sent back or reworked in review:

- **Only improvements that hold for every site are accepted.** A new switch, a new configuration entry or a new feature, however small, is product behavior: open an Issue first and explain the scenario. Every switch has to be maintained by every site for the long term, and most PRs of this kind submitted without discussion were not accepted. Your own site's rules, numbers and examples stay in your own `industry/` and `site/`, not in the shared prompt templates, comments and tests.
- **Look for what exists first.** Search before adding a function, hook or configuration; a common capability usually exists once already. A module sends its own files with `sendFile` from `apps/api/src/routes/static.ts`; a relay service is set with `LLM_BASE_URL`. A second copy will drift from the first sooner or later.
- **Tests only prove the cases you thought of.** If you changed collection, dates, body cleaning, selection or grouping, run a batch of real public feeds and pages before and after the change, and state in the PR how many results changed and whether every change is right. Times on Chinese web pages often lack a zone; read them in the source's zone (default `+08:00`), and "CST" on them usually means Beijing time. Test results must not depend on the time zone of the machine running them.
- **Tests guard behavior, not wording.** Put a test that reproduces a problem in the feature's existing test file; do not open a new file for one fix. Do not assert private constants, CSS class names, pixel positions or the browser's own behavior, and do not pin the pre-refactor output as a permanent test. Tests are trimmed to this standard before merging.
- **External PRs may not change these files:** dependencies and lock files (dependabot proposes version upgrades), `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md`, the rules under `.agents/` and `.claude/`, and binary files (generate test samples in code). If one needs changing, open an Issue and a maintainer will change it: the rules files decide how later agents work, and dependencies and binaries cannot be reviewed line by line.
- **Change everything it touches.** A new environment variable goes into `.env.example`, and new site configuration into `site/`. If you change what a configuration field means, update the example configuration so deployed sites behave the same after upgrading (for example, if images are sent only to models that declare `vision`, add the declaration to the presets that could already see images). When you change a name or entry point readers see, change every place it appears. When you add or change navigation configuration, check the desktop sidebar, the mobile bottom bar, back navigation and the "Me" entry with both the default and a non-default configuration, and look at the tab layout in a browser when there are fewer entries; an unchanged default only proves the old behavior, not that the configuration works.
