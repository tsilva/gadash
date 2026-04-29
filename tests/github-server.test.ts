import assert from "node:assert/strict";
import test from "node:test";

import { fetchGitHubRepoLineGrowth } from "../lib/github-server.ts";

test("fetchGitHubRepoLineGrowth returns immediately when GitHub is still generating stats", async () => {
  const originalFetch = global.fetch;
  let requestCount = 0;

  try {
    global.fetch = (async () => {
      requestCount += 1;

      return new Response("", { status: 202 });
    }) as typeof fetch;

    const result = await fetchGitHubRepoLineGrowth(
      { id: "1", nameWithOwner: "tsilva/gadash" },
      "github-access-token",
    );

    assert.equal(requestCount, 1);
    assert.deepEqual(result, {
      repoId: "1",
      repoName: "tsilva/gadash",
      fetchedOn: result.fetchedOn,
      weeks: [],
      status: "error",
      errorMessage: "GitHub is still generating repository statistics. Try Refresh again later.",
    });
  } finally {
    global.fetch = originalFetch;
  }
});
