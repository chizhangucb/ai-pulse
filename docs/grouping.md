# Story grouping and relation evaluation

The site first recalls candidate facts from the last two weeks by title and summary (by vector similarity when an embedding service is configured, otherwise by shared wording). A model then judges how the reports relate, and at the same time whether the report adds anything new to what the picks already hold (a report whose score is high enough needs this to become a pick; see [Selection and calibration](selection.md)). The relation definitions and the prompts the site really uses are in `industry/prompts/group-*.md`; the code starts in `packages/backend/src/events/relate.ts` and `group.ts`.

The four relations are:

- `SAME_OCCURRENCE`: the same real happening, such as an official announcement of a release and media reports of that release.
- `SAME_STORY`: not the same happening, but a direct development of the same specific story, such as availability, reviews or responses after a release.
- `UNRELATED`: different things, even with the same company, product or topic.
- `ROUNDUP`: one side is a roundup that covers several topics.

## Evaluating pairwise relations with your own labelled samples

`scripts/eval-relations.ts` evaluates only the model's judgment of the relation between two reports. It reuses the site's own `PAIR_SYSTEM`, `pairUser()`, `PairSchema` and prompt version, so the evaluation follows any prompt change. It does not rerun candidate recall and writes nothing back to story grouping.

Keep your labelled data under `.data/` (never committed to Git). `industry/relation-gold.example.jsonl` has four made-up examples. One case per line:

```json
{"caseId":"release-001","a":{"title":"...","source":"...","firstParty":true,"publishedAt":"2026-09-01T09:00:00-07:00","summary":"..."},"b":{"title":"...","source":"...","firstParty":false,"publishedAt":"2026-09-01T09:20:00-07:00","summary":"..."},"samplingContext":{"benchmarkSplit":"development","samplingStratum":"same-release"},"gold":{"relation":"SAME_OCCURRENCE"}}
```

`a` and `b` can also carry an optional `frame`, the same as the site's internal `ReportView`:

```json
{"subject":"Acme","action":"released","object":"Acme-2","occurredAt":"2026-09-01"}
```

Put easily confused borderline samples in the development set, and keep some as `benchmarkSplit: "holdout"` for a final check. `samplingStratum` is an optional group label for seeing which kind of case goes wrong; it does not change the model input.

### Running it

Set up the database and models as for a normal deployment, then run:

```bash
node --env-file=.env scripts/eval-relations.ts \
  --gold .data/relation-gold.jsonl \
  --split development
```

By default it uses the model of the "group review" step: one switched on the admin's Models and evals page wins, then the `GROUP_REVIEW_MODEL` environment variable, then `DEFAULTS.groupReview` in `site/models.ts`, and otherwise the default model. You can also compare several configured models:

```bash
node --env-file=.env scripts/eval-relations.ts \
  --gold .data/relation-gold.jsonl \
  --models default,deepseek-flash \
  --split development \
  --n 200 \
  --seed 7 \
  --thresholds 0.75,0.8
```

Options:

| Option | Default | Meaning |
|---|---:|---|
| `--gold` | `.data/relation-gold.jsonl` | Labelled samples (JSONL) |
| `--models` | the current "group review" model | Comma-separated model names |
| `--split` | `all` | `development`, `holdout` or a split of your own |
| `--n` | `200` | At most this many cases |
| `--seed` | `7` | Random seed for sampling; the same seed draws the same cases |
| `--concurrency` | `6` | Model requests in flight at once |
| `--thresholds` | production's `STORY_REVIEW_MIN_CONFIDENCE,TIE_MIN_CONFIDENCE` | Confidence thresholds for "joins the same story"; passing them overrides the default |

The full report goes to `.data/eval/relations-*.json`. For each model it gives:

- a 4 × 4 confusion table: which relation each labelled relation was judged as;
- precision, recall, F1 and sample count for each relation (counting only cases with a structured judgment);
- `coverage`: the share of all gold cases that got a structured judgment;
- `accuracy` and the four-class macro-F1, which measure judgment quality only where a structured judgment came back; `completeAccuracy` divides by all gold cases, so a failed call or a malformed answer counts as not done right;
- with both `SAME_OCCURRENCE` and `SAME_STORY` counted as "joins the same story", precision, recall and F1 at each confidence threshold, with `coverage` and `completeAccuracy` for the same cases;
- the number of failed calls, token use, mean latency per request and the total time of the run;
- each case's judgment, confidence, the model's note on the difference (`difference`) and receipt number.

Model calls go through receipts and budget circuit breakers as usual. Repeating an evaluation with the same model, prompt and input reuses existing receipts; within one run, cases with the same input share one request's result, each scored against its own label, and a failure is shared too rather than requested again in that run. `reused` in the report counts shared successes or failures and reused earlier successful receipts. Evaluation receipts have their own purpose, `eval_relation_pair`, and do not count in the admin statistics of the site's grouping steps.

Token use and mean latency add up every request attempt behind the receipts the report cites, including earlier responses that failed to parse; a receipt shared by several cases is counted once. A rerun on existing results still shows that earlier use, which is not new spending.

CI checks the JSONL parsing, sampling with a fixed seed, every metric, and concurrent reuse and retry accounting against a local fake model service, without reaching any outside model service.
