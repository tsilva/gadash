import assert from "node:assert/strict";
import test from "node:test";

import { summarizeSnapshots } from "../lib/dashboard.ts";

test("summarizeSnapshots counts only accessible properties in totals", () => {
  const summary = summarizeSnapshots([
    {
      propertyId: "1",
      label: "Site A",
      nearNowActiveUsers: 4,
      last30MinActiveUsers: 11,
      status: "ok",
      fetchedAt: "2026-03-13T10:00:00.000Z",
    },
    {
      propertyId: "2",
      label: "Site B",
      nearNowActiveUsers: null,
      last30MinActiveUsers: null,
      status: "no_access",
      fetchedAt: "2026-03-13T10:00:00.000Z",
    },
    {
      propertyId: "3",
      label: "Site C",
      nearNowActiveUsers: null,
      last30MinActiveUsers: null,
      status: "error",
      fetchedAt: "2026-03-13T10:00:00.000Z",
    },
  ]);

  assert.deepEqual(summary, {
    totalNearNowActiveUsers: 4,
    totalLast30MinActiveUsers: 11,
    accessibleCount: 1,
    inaccessibleCount: 1,
    errorCount: 1,
    fetchedAt: "2026-03-13T10:00:00.000Z",
    isPartial: true,
  });
});
