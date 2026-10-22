// Day headers of the timeline (features/feed/Timeline.tsx). Failure case: an item imported from an archive, dated
// 2019-02-19, sits under a header reading "Feb 19", and readers take it for this year's.
import assert from "node:assert/strict";
import { test } from "node:test";
import { monthDay } from "@aihot/contracts/time";

test("a day of today's year has no year; another year's carries it", () => {
  assert.equal(monthDay("2026-10-05", "2026-10-19"), "Oct 5");
  assert.equal(monthDay("2019-02-19", "2026-10-19"), "Feb 19, 2019");
  assert.equal(monthDay("2025-12-31", "2026-01-01"), "Dec 31, 2025");
});

test("without today, as everywhere else, it stays month and day", () => {
  assert.equal(monthDay("2019-02-19"), "Feb 19");
});
