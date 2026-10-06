import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

// Use the SDK's CommonJS exports, including its dynamically re-exported core APIs.
const require = createRequire(import.meta.url);
const Sentry: typeof import("@sentry/nextjs") = require("@sentry/nextjs");
const { GET }: typeof import("../app/api/sentry/smoke/route.ts") = require("../app/api/sentry/smoke/route.ts");

test("smoke route distinguishes authorization, disabled SDK, and queue state without network traffic", async () => {
  const previousToken = process.env.SENTRY_SMOKE_TEST_TOKEN;
  const previousClient = Sentry.getClient();
  const envelopes: unknown[] = [];
  let flushResult = true;
  const request = (token?: string) => new Request("https://gadash.tsilva.eu/api/sentry/smoke", {
    headers: token ? { "x-sentry-smoke-token": token } : {},
  });

  try {
    delete process.env.SENTRY_SMOKE_TEST_TOKEN;
    assert.equal((await GET(request("test-token"))).status, 404);
    process.env.SENTRY_SMOKE_TEST_TOKEN = "test-token";
    assert.equal((await GET(request())).status, 404);
    assert.equal((await GET(request("wrong-token"))).status, 404);
    assert.equal((await GET(request("test-token"))).status, 503);

    // All envelopes remain in memory; this test never contacts an ingestion service.
    const client = new Sentry.NodeClient({
      dsn: "https://abc123@sentry.example/123",
      enabled: true,
      integrations: [],
      stackParser: () => [],
      transport: () => ({
        send: async (envelope) => {
          envelopes.push(envelope);
          return { statusCode: 200 };
        },
        flush: async () => flushResult,
      }),
    });
    Sentry.setCurrentClient(client);

    const response = await GET(request("test-token"));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.match(payload.eventId, /^[a-f0-9]{32}$/);
    assert.equal(payload.queueFlushed, true);
    assert.equal("ok" in payload, false);
    assert.equal(envelopes.length, 1);

    flushResult = false;
    const failedResponse = await GET(request("test-token"));
    assert.equal(failedResponse.status, 503);
    assert.equal((await failedResponse.json()).queueFlushed, false);
    await client.close();
  } finally {
    Sentry.setCurrentClient(previousClient);
    if (previousToken === undefined) delete process.env.SENTRY_SMOKE_TEST_TOKEN;
    else process.env.SENTRY_SMOKE_TEST_TOKEN = previousToken;
  }
});
