# X posts through the ingest endpoint

AI Pulse does not pull X itself. An external job reads the accounts in [`industry/x-accounts.json`](../industry/x-accounts.json) once an hour and pushes their new posts to `POST /api/ingest/items`. Pushed posts are stored and then go through the same steps as collected articles: duplicate check, prefilter, scoring twice against the account's tier threshold, write-up, and event grouping.

## Before the first push

1. Set `INGEST_TOKEN` in `.env` (at least 16 characters) and restart the API.
2. Run `node --env-file=.env scripts/seed.ts`. It creates one `external` source per account, with id `x-<handle in lower case>`, the tier from the file, and participation `editorial`.

Push each account under its own `sourceId`, so its posts are judged at its tier. A `sourceId` the site does not know is created as `isolated` and stays off public pages until an admin sets it to `editorial`.

## Request

One request per account, at most 50 posts. Put the post text in `title`, the post address in `url`, and the post time with its zone in `publishedAt`.

The model judges a post on its text, and the site cannot fetch x.com or twitter.com pages. For those addresses the `title` is the text, so the payload below is judged as it is. Send the full text in `text` (or `body`) when it is longer than the title you want to store. Items from other sites can carry `text` or `body` too; without it they wait until the site has fetched the page.

```bash
curl -X POST "$SITE_URL/api/ingest/items" \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceId": "x-openai",
    "sourceName": "X: OpenAI (@OpenAI)",
    "items": [
      {
        "title": "We are releasing a new model in the API today. It is faster and cheaper than the last one.",
        "url": "https://x.com/OpenAI/status/1980000000000000000",
        "publishedAt": "2026-10-21T17:05:00Z",
        "author": "OpenAI"
      }
    ]
  }'
```

The response is `{"ok": true, "created": 1}`. Posts already stored are not created again, so the job can safely resend the last hour's posts.

| Status | Meaning |
|---|---|
| 401 | Missing or wrong token, or `INGEST_TOKEN` is not set |
| 409 | The source is paused in the admin |
| 413 | More than 50 items |
| 429 | Over `INGEST_RATE_LIMIT` pushes per minute (default 10 with Docker); 32 accounts an hour fit when the job waits about 7 seconds between requests |

To push old posts without them counting as today's news, add `"raw": {"_aihot": {"backfill": true}}` to each item.
