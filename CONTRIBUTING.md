# Contributing

Reproducible issues, documentation fixes and improvements that are useful for other industries too are welcome, in English or Chinese.

## Where to talk

- [Issues](https://github.com/KKKKhazix/AIHOT/issues/new/choose): reproducible bugs and feature requests with a clear scenario.
- [Deployment and usage Q&A](https://github.com/KKKKhazix/AIHOT/discussions/categories/q-a): installation, configuration, deployment and usage questions; mark the answer once a question is solved.
- [Ideas](https://github.com/KKKKhazix/AIHOT/discussions/categories/ideas): discuss direction and use cases first.
- [Show and tell](https://github.com/KKKKhazix/AIHOT/discussions/categories/show-and-tell): share the industry news site you built and what you learned.
- Report security vulnerabilities privately, as described in [Security reports](SECURITY.md).

## What to contribute

Improvements to the deployment experience, general collection capabilities, the processing pipeline, public interfaces, accessibility, documentation and reproducible failures are especially welcome. Before a large change to the architecture or product behavior, describe the scenario and the plan in an Issue or a discussion, so you do not find out the direction does not fit after the work is done.

Sources and selection criteria that suit only your industry belong in `industry/` in your own repository; the site name, brand and pages belong in `site/`; a feature only your site needs becomes a module in `modules/` (see [Architecture](docs/architecture.md#modules)). The steps are in [Customizing](docs/customize.md). For compliance and risk reasons, the full list of sources in operation is not shared for now; this repository also does not maintain dedicated collection adapters for platforms such as Weibo and Xiaohongshu. You can bring in the results of an external collector you maintain yourself as described in [Sources](docs/sources.md).

## Submitting a change

1. Fork this repository and create your branch from the latest `main`. If you only want to set up an independent site, you can use [Use this template](https://github.com/KKKKhazix/AIHOT/generate); a project generated from the template shares no commit history, so a fork suits contributing code or merging upstream updates better.
2. Read [AGENTS.md](AGENTS.md) and the documents for the area you change. Keep each PR to one clear problem, without unrelated refactoring and without `package-lock.json` changes from reinstalling dependencies. Dependency upgrades, agent rule files (`AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`) and binary files are not changed by external PRs; open an Issue when one needs changing, and a maintainer will change it.
3. Set up a local environment as in [Deployment](docs/deploy.md). Use a separate test database, and keep collection, model calls and external pushes off during development; do not test against a production database or real paid services.
4. Verify the behavior your change touches and write the results in the PR; CI from a fork runs only after a maintainer approves it and does not replace local checks. For code changes, run `npm run typecheck`, `npm test`, and the web build and web tests. The backend test database name must end in `_test` or `_ci` (it is created and migrated if missing), and each test file runs in parallel on its own copy, so the test database account needs the `CREATEDB` privilege. A running site can be checked with `node scripts/smoke.ts --base http://localhost:3000`. A documentation or template change only needs its links, syntax and rendering checked; do not add tests just to add them.
   When you change the database, do not change a released migration; put the fix in a new file. A new file holds one statement that is safe to run online, and the PR checks this automatically; you can run `node scripts/check-migrations.ts --base main` locally first. The rules are in the [migration rules](docs/architecture.md#database-migrations).
   The backup and restore tests also need `tar` and a `pg_dump`/`pg_restore` compatible with the server version; the tests create and clean up their own temporary restore database and file directories, and do not access real object storage.
5. Open the PR against `main` of this repository, link the related Issue, and tick "Allow edits by maintainers": for a small problem a maintainer can fix it on your branch and merge, without another round trip. Open a draft while you are still working and mark it ready when done. Attach screenshots for page changes; when configuration or upgrade steps are involved, update the documents too, and put what deployed sites must do when upgrading in the "Updating" section of [Deployment](docs/deploy.md).

`main` is merged through PRs. When it is ready to merge, squash the PR branch into one commit with the correct authorship; update a branch you already pushed with `git push --force-with-lease`. The branch must include the latest `main`; after GitHub's `check` and `docker` pass on that commit, a maintainer merges it with rebase, keeping your authorship.

Do not commit `.env`, secrets, admin passwords, cookies, production data or material you are not authorized to use; remove sensitive information from logs and screenshots too. The code is under the [MIT License](LICENSE); brand and third-party material are described in [NOTICE](NOTICE).
