import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../app/api/pagespeed/bulk/route.ts";
import { createDashboardSessionValue } from "../lib/server-auth.ts";

function createAuthedRequest(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);

  headers.set("cookie", `gadash.auth=${createDashboardSessionValue("eng.tiago.silva@gmail.com", "test-secret")}`);

  return new Request(url, {
    ...init,
    headers,
  });
}

function withEnv(overrides: Record<string, string | undefined>, run: () => Promise<void>) {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return run().finally(() => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

test("POST returns a config error when the API key is missing", async () => {
  await withEnv(
    {
      PAGESPEED_API_KEY: undefined,
      PAGESPEED_MONITORED_URLS: "https://alpha.example",
      AUTH_SESSION_SECRET: "test-secret",
    },
    async () => {
      const response = await POST(createAuthedRequest("https://gadash.tsilva.eu/api/pagespeed/bulk", { method: "POST" }));
      const payload = (await response.json()) as { error: string };

      assert.equal(response.status, 500);
      assert.equal(payload.error, "Missing PAGESPEED_API_KEY server configuration.");
    },
  );
});

test("POST returns a config error when the monitored URLs are invalid", async () => {
  await withEnv(
    {
      PAGESPEED_API_KEY: "test-key",
      PAGESPEED_MONITORED_URLS: "http://alpha.example",
      AUTH_SESSION_SECRET: "test-secret",
    },
    async () => {
      const response = await POST(createAuthedRequest("https://gadash.tsilva.eu/api/pagespeed/bulk", { method: "POST" }));
      const payload = (await response.json()) as { error: string };

      assert.equal(response.status, 500);
      assert.match(payload.error, /PAGESPEED_MONITORED_URLS contains invalid site URL/);
    },
  );
});

test("POST returns partial success rows and report links", async () => {
  const originalFetch = global.fetch;

  try {
    global.fetch = (async (input: string | URL | Request) => {
      const requestUrl = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const siteUrl = requestUrl.searchParams.get("url");
      const strategy = requestUrl.searchParams.get("strategy");

      if (siteUrl === "https://beta.example/" && strategy === "desktop") {
        return new Response(JSON.stringify({ error: { message: "desktop failed" } }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          lighthouseResult: {
            categories: {
              performance: { score: strategy === "mobile" ? 0.88 : 0.97 },
              accessibility: { score: 0.9 },
              "best-practices": { score: 0.92 },
              seo: { score: 0.94 },
            },
            audits: {
              "first-contentful-paint": { displayValue: "1.0 s" },
              "largest-contentful-paint": { displayValue: "1.8 s" },
              "total-blocking-time": { displayValue: "40 ms" },
              "cumulative-layout-shift": { displayValue: "0.02" },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    await withEnv(
      {
        PAGESPEED_API_KEY: "test-key",
        PAGESPEED_MONITORED_URLS: "https://alpha.example\nhttps://beta.example",
        AUTH_SESSION_SECRET: "test-secret",
      },
      async () => {
        const response = await POST(createAuthedRequest("https://gadash.tsilva.eu/api/pagespeed/bulk", { method: "POST" }));
        const payload = (await response.json()) as {
          totalSites: number;
          rows: Array<{ status: string; reportUrl: string; checkedAt: string | null; errorMessage?: string }>;
        };

        assert.equal(response.status, 200);
        assert.equal(payload.totalSites, 2);
        assert.equal(payload.rows[0]?.status, "ok");
        assert.equal(payload.rows[1]?.status, "error");
        assert.equal(
          payload.rows[0]?.reportUrl,
          "https://pagespeed.web.dev/analysis?url=https%3A%2F%2Falpha.example%2F&form_factor=mobile",
        );
        assert.equal(typeof payload.rows[0]?.checkedAt, "string");
        assert.match(payload.rows[1]?.errorMessage ?? "", /Desktop: desktop failed/);
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("POST forwards the request origin as the PageSpeed referer", async () => {
  const originalFetch = global.fetch;
  const seenReferers: string[] = [];

  try {
    global.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seenReferers.push(headers.get("Referer") ?? "");

      return new Response(
        JSON.stringify({
          lighthouseResult: {
            categories: {
              performance: { score: 0.88 },
              accessibility: { score: 0.9 },
              "best-practices": { score: 0.92 },
              seo: { score: 0.94 },
            },
            audits: {
              "first-contentful-paint": { displayValue: "1.0 s" },
              "largest-contentful-paint": { displayValue: "1.8 s" },
              "total-blocking-time": { displayValue: "40 ms" },
              "cumulative-layout-shift": { displayValue: "0.02" },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    await withEnv(
      {
        PAGESPEED_API_KEY: "test-key",
        PAGESPEED_MONITORED_URLS: "https://alpha.example",
        AUTH_SESSION_SECRET: "test-secret",
      },
      async () => {
        const response = await POST(createAuthedRequest("https://gadash.tsilva.eu/api/pagespeed/bulk", { method: "POST" }));

        assert.equal(response.status, 200);
        assert.deepEqual(seenReferers, ["https://gadash.tsilva.eu/", "https://gadash.tsilva.eu/"]);
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("POST can refresh a single configured site", async () => {
  const originalFetch = global.fetch;
  const seenUrls: string[] = [];

  try {
    global.fetch = (async (input: string | URL | Request) => {
      const requestUrl = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      seenUrls.push(requestUrl.searchParams.get("url") ?? "");

      return new Response(
        JSON.stringify({
          lighthouseResult: {
            categories: {
              performance: { score: 0.88 },
              accessibility: { score: 0.9 },
              "best-practices": { score: 0.92 },
              seo: { score: 0.94 },
            },
            audits: {
              "first-contentful-paint": { displayValue: "1.0 s" },
              "largest-contentful-paint": { displayValue: "1.8 s" },
              "total-blocking-time": { displayValue: "40 ms" },
              "cumulative-layout-shift": { displayValue: "0.02" },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    await withEnv(
      {
        PAGESPEED_API_KEY: "test-key",
        PAGESPEED_MONITORED_URLS: "https://alpha.example\nhttps://beta.example",
        AUTH_SESSION_SECRET: "test-secret",
      },
      async () => {
        const response = await POST(
          createAuthedRequest("https://gadash.tsilva.eu/api/pagespeed/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: "https://beta.example/" }),
          }),
        );
        const payload = (await response.json()) as {
          totalSites: number;
          rows: Array<{ url: string }>;
        };

        assert.equal(response.status, 200);
        assert.equal(payload.totalSites, 1);
        assert.deepEqual(payload.rows.map((row) => row.url), ["https://beta.example/"]);
        assert.deepEqual(seenUrls, ["https://beta.example/", "https://beta.example/"]);
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("POST rejects row refreshes for unconfigured sites", async () => {
  await withEnv(
    {
      PAGESPEED_API_KEY: "test-key",
      PAGESPEED_MONITORED_URLS: "https://alpha.example",
      AUTH_SESSION_SECRET: "test-secret",
    },
    async () => {
      const response = await POST(
        createAuthedRequest("https://gadash.tsilva.eu/api/pagespeed/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: "https://beta.example/" }),
        }),
      );
      const payload = (await response.json()) as { error: string };

      assert.equal(response.status, 400);
      assert.equal(payload.error, "Requested PageSpeed site is not in PAGESPEED_MONITORED_URLS.");
    },
  );
});

test("POST rejects unauthenticated PageSpeed requests", async () => {
  await withEnv(
    {
      PAGESPEED_API_KEY: "test-key",
      PAGESPEED_MONITORED_URLS: "https://alpha.example",
      AUTH_SESSION_SECRET: "test-secret",
    },
    async () => {
      const response = await POST(new Request("https://gadash.tsilva.eu/api/pagespeed/bulk", { method: "POST" }));
      const payload = (await response.json()) as { error: string };

      assert.equal(response.status, 401);
      assert.equal(payload.error, "Dashboard sign-in required.");
    },
  );
});
