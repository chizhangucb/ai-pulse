# Story digest prompt evaluation

The overview on a story page is written from `industry/prompts/story-digest.md`. Before changing that prompt, run the current prompt and the candidate side by side on the same stories and compare them by hand, instead of judging from how pages look.

## 1. Prepare the cases

```bash
node --env-file=.env scripts/eval-story-digests.ts --stories <story id>,<story id> --out .data/story-digest-cases.jsonl
```

A story id is the part of the story page address `/story/<id>`. The export only reads the database: it calls no model and changes no story. Reports are chosen by the same rules the site uses when it writes an overview, except that passing mentions, roundups, withdrawn reports and reports not yet public do not count. A story that already has an overview is assembled as "rewrite after a correction" (without the previous overview); one without an overview is assembled as a first draft. A story that cannot be found, was merged, or has no usable report is an error.

The exported file has one story per line, and you can review it first. To test the incremental update after new reports, set `inputMode` to `incremental` and fill in `story.previousDigest` and `knownArticleIds` (the ids of the reports the previous version already covered). You can also write cases by hand; the format is in `industry/story-digest-eval.example.jsonl` (made-up examples).

## 2. Compare side by side

```bash
node --env-file=.env scripts/eval-story-digests.ts --cases .data/story-digest-cases.jsonl --system my-candidate.md
```

- Each case runs once with the current prompt and once with the candidate: the same model (by default the one the "story digest" step uses now; `--models` picks others) and the same input. The system prompt, input and sampling parameters sent to the model are exactly the ones the site uses.
- A candidate file is written like the files in `industry/prompts/`: `{{siteName}}` becomes the site name and `{{> file name}}` inserts a shared rule; a missing value is an error. The run refuses a candidate that renders identical to the current prompt. Without `--system` only the current prompt runs.
- Before starting it prints the number of calls (cases × models × prompts) and sends none when that is over `--max-calls` (18 by default). Every call is logged and counted against the budget like the site's other model requests. Rerunning the same input reuses the answers already received at no cost, so after changing a candidate and running again, the current-prompt half costs nothing.

Results go to `.data/eval/` (`--out-dir` changes it), one JSON and one Markdown file: the two titles and overviews side by side, with each call's token use and record number, and the reason for any failed call.

## 3. What to look at

There is no reliable automatic score, and this tool does not let a model grade a model. Read each case:

- Does it state the core change and the current conclusion first, instead of retelling the timeline below it by date?
- Is there empty promotional tone or boilerplate?
- Do conditions, who it applies to, pricing and quotas, regions and other limits stay attached to what they apply to?
- Is there anything not in the reports and fact evidence? Does it comment on the reporting itself ("the report does not disclose...") or put writing instructions into the text?
- In a rewrite after a correction, are the outdated claims gone?

## 4. After changing the prompt

A new prompt version does not by itself rewrite existing overviews. A story's overview is written again only when its reports change, and with new reports the old overview is the previous version for an incremental rewrite. So the new prompt takes effect gradually with new reports and never causes a burst of model calls.

To have a few stories rewritten with the new prompt right away, call `rewriteStoryDigest` from the repository root (one model call per story, recorded in the admin audit log):

```bash
node --env-file=.env --input-type=module -e '
const { rewriteStoryDigest } = await import("@aihot/backend/events/corrections");
const { sql } = await import("@aihot/backend/db");
const [s] = await sql`SELECT id FROM stories WHERE public_id = ${"<story id>"}`;
if (!s) throw new Error("no story with this id");
console.log(await rewriteStoryDigest(s.id, "Story digest prompt updated", "ops-script"));
await sql.end();'
```
