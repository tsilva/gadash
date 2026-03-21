import assert from "node:assert/strict";
import test from "node:test";

import { aggregateWeeklyContributions } from "../lib/github.ts";

test("aggregateWeeklyContributions groups by week and computes a moving average", () => {
  const aggregated = aggregateWeeklyContributions([
    { date: "2026-03-02", value: 2 },
    { date: "2026-03-03", value: 3 },
    { date: "2026-03-10", value: 5 },
    { date: "2026-03-11", value: 7 },
  ], 2);

  assert.deepEqual(aggregated, [
    { date: "2026-03-02", value: 5, secondaryValue: 5 },
    { date: "2026-03-09", value: 12, secondaryValue: 8.5 },
  ]);
});
