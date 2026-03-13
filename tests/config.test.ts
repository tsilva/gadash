import assert from "node:assert/strict";
import test from "node:test";

import { parseDashboardProperties } from "../lib/config.ts";

test("parseDashboardProperties sorts by sortOrder and label", () => {
  const parsed = parseDashboardProperties(
    JSON.stringify([
      { id: "2", label: "Bravo", sortOrder: 2 },
      { id: "1", label: "Alpha", sortOrder: 1 },
      { id: "3", label: "Charlie" },
    ]),
  );

  assert.deepEqual(
    parsed.map((entry) => entry.id),
    ["1", "2", "3"],
  );
});

test("parseDashboardProperties throws on invalid payloads", () => {
  assert.throws(() => parseDashboardProperties('{"id":"123"}'), {
    message:
      "NEXT_PUBLIC_GA_PROPERTIES_JSON must be an array of { id, label, sortOrder? } objects.",
  });
});
