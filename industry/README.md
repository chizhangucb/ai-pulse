# Industry pack

Everything this industry knows lives here: categories, topics, sources, selection criteria and thresholds. Switching to another industry mostly means changing this folder and [`site/`](../site/) (site name, copy, brand and pages); the steps are in [Make it your field](../docs/customize.md).

| File | Contents |
|---|---|
| `taxonomy.ts` | Categories, tags, companies and organizations, the word list that keeps models from misspelling companies, and the kind of release this industry watches most (`RELEASE`) |
| `topics.json` | The topic directory (`/topics`), read when the site starts |
| `sources.json` | The demo sources imported on first start |
| `prompts/` | The prompt for each step: prefilter, scoring, writing, structuring, grouping, event summaries, weekly and monthly reports, translation |
| `selection.ts` | Selection thresholds |
| `gold.example.jsonl` | Example format of selection evaluation samples |
| `relation-gold.example.jsonl` | Example format of event relation evaluation samples |
| `story-digest-eval.example.jsonl` | Example format of event summary evaluation cases |
