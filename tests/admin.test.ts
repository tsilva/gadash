import assert from "node:assert/strict";
import test from "node:test";

import { discoverDashboardProperties, discoverPageSpeedSites } from "../lib/admin.ts";

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

test("discoverPageSpeedSites reads and deduplicates GA web stream URLs", async () => {
  const originalFetch = globalThis.fetch;
  const seenUrls: string[] = [];

  globalThis.fetch = async (input: string | URL | Request) => {
    const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    seenUrls.push(requestUrl);

    return new Response(
      JSON.stringify({
        dataStreams: [
          {
            displayName: "Alpha stream",
            webStreamData: { defaultUri: "alpha.example" },
          },
          {
            displayName: "Duplicate Alpha",
            webStreamData: { defaultUri: "https://alpha.example/" },
          },
          {
            displayName: "App stream",
          },
        ],
      }),
      { status: 200 },
    );
  };

  try {
    const sites = await discoverPageSpeedSites([{ id: "1", label: "Alpha" }], "token");

    assert.deepEqual(sites, [{ url: "https://alpha.example/", label: "Alpha stream" }]);
    assert.equal(seenUrls[0]?.startsWith("https://analyticsadmin.googleapis.com/v1beta/properties/1/dataStreams?"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
