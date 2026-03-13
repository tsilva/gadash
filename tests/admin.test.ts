import assert from "node:assert/strict";
import test from "node:test";

import { discoverDashboardProperties } from "../lib/admin.ts";

test("discoverDashboardProperties deduplicates and sorts discovered properties", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        accountSummaries: [
          {
            propertySummaries: [
              { property: "properties/3", displayName: "Zulu" },
              { property: "properties/1", displayName: "Alpha" },
              { property: "properties/1", displayName: "Alpha duplicate" },
            ],
          },
        ],
      }),
      { status: 200 },
    );

  try {
    const properties = await discoverDashboardProperties("token");

    assert.deepEqual(properties, [
      { id: "1", label: "Alpha" },
      { id: "3", label: "Zulu" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
