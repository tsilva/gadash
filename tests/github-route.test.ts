import assert from "node:assert/strict";
import test from "node:test";

import { GET as oauthCallback } from "../app/api/github/oauth/callback/route.ts";
import { POST as githubMetrics } from "../app/api/github/metrics/route.ts";
import { GET as oauthStart } from "../app/api/github/oauth/start/route.ts";
import { GET as githubSession } from "../app/api/github/session/route.ts";
import { POST as githubSignOut } from "../app/api/github/sign-out/route.ts";
import {
  createDashboardSessionValue,
  createGitHubSessionValue,
} from "../lib/server-auth.ts";

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

function createCookieHeader(
  extraCookies: Array<{ name: string; value: string }> = [],
) {
  const cookies = [
    `gadash.auth=${createDashboardSessionValue("eng.tiago.silva@gmail.com", "test-secret")}`,
    ...extraCookies.map((cookie) => `${cookie.name}=${cookie.value}`),
  ];

  return cookies.join("; ");
}

test("GET /api/github/oauth/start requires dashboard auth and sets an OAuth state cookie", async () => {
  await withEnv(
    {
      AUTH_SESSION_SECRET: "test-secret",
      GITHUB_CLIENT_ID: "github-client-id",
    },
    async () => {
      const response = await oauthStart(
        new Request("https://gadash.tsilva.eu/api/github/oauth/start", {
          headers: {
            cookie: createCookieHeader(),
          },
        }),
      );
      const location = response.headers.get("location") ?? "";
      const setCookie = response.headers.get("set-cookie") ?? "";

      assert.equal(response.status, 307);
      assert.match(location, /^https:\/\/github\.com\/login\/oauth\/authorize\?/);
      assert.match(location, /client_id=github-client-id/);
      assert.match(location, /scope=read%3Auser\+repo/);
      assert.match(location, /state=/);
      assert.match(setCookie, /gadash\.github-oauth-state=/);
    },
  );
});

test("GET /api/github/oauth/callback sets the GitHub session cookie and redirects to the popup page", async () => {
  const originalFetch = global.fetch;

  try {
    global.fetch = (async () =>
      new Response(
        JSON.stringify({
          access_token: "github-access-token",
          scope: "read:user repo",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    await withEnv(
      {
        AUTH_SESSION_SECRET: "test-secret",
        GITHUB_CLIENT_ID: "github-client-id",
        GITHUB_CLIENT_SECRET: "github-client-secret",
      },
      async () => {
        const response = await oauthCallback(
          new Request("https://gadash.tsilva.eu/api/github/oauth/callback?code=abc123&state=state-123", {
            headers: {
              cookie: createCookieHeader([{ name: "gadash.github-oauth-state", value: "state-123" }]),
            },
          }),
        );
        const location = response.headers.get("location") ?? "";
        const setCookie = response.headers.get("set-cookie") ?? "";

        assert.equal(response.status, 307);
        assert.equal(location, "https://gadash.tsilva.eu/github/auth/popup?success=1");
        assert.match(setCookie, /gadash\.github=/);
        assert.match(setCookie, /gadash\.github-oauth-state=;/);
        assert.doesNotMatch(location, /github-access-token/);
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("GET /api/github/session returns connection state for the server-held GitHub cookie", async () => {
  await withEnv(
    {
      AUTH_SESSION_SECRET: "test-secret",
    },
    async () => {
      const response = await githubSession(
        new Request("https://gadash.tsilva.eu/api/github/session", {
          headers: {
            cookie: createCookieHeader([
              {
                name: "gadash.github",
                value: createGitHubSessionValue(
                  "github-access-token",
                  "read:user repo",
                  "test-secret",
                ),
              },
            ]),
          },
        }),
      );
      const payload = (await response.json()) as { connected: boolean; scope?: string };

      assert.equal(response.status, 200);
      assert.deepEqual(payload, { connected: true, scope: "read:user repo" });
    },
  );
});

test("POST /api/github/metrics requires a GitHub session cookie", async () => {
  await withEnv(
    {
      AUTH_SESSION_SECRET: "test-secret",
    },
    async () => {
      const response = await githubMetrics(
        new Request("https://gadash.tsilva.eu/api/github/metrics", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: createCookieHeader(),
          },
          body: JSON.stringify({}),
        }),
      );
      const payload = (await response.json()) as { error: string };

      assert.equal(response.status, 401);
      assert.equal(payload.error, "GitHub sign-in required.");
    },
  );
});

test("POST /api/github/metrics proxies GitHub data without exposing a browser token", async () => {
  const originalFetch = global.fetch;

  try {
    global.fetch = (async (input: string | URL | Request) => {
      const requestUrl = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);

      if (requestUrl.pathname === "/user") {
        return new Response(
          JSON.stringify({
            login: "tsilva",
            followers: 42,
            html_url: "https://github.com/tsilva",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (requestUrl.pathname === "/user/repos") {
        return new Response(
          JSON.stringify([
            {
              id: 1,
              name: "gadash",
              full_name: "tsilva/gadash",
              html_url: "https://github.com/tsilva/gadash",
              owner: { login: "tsilva" },
              stargazers_count: 5,
              private: true,
              pushed_at: "2026-04-09T12:00:00Z",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (requestUrl.pathname === "/graphql") {
        return new Response(
          JSON.stringify({
            data: {
              viewer: {
                contributionsCollection: {
                  contributionCalendar: {
                    weeks: [
                      {
                        contributionDays: [
                          { date: "2026-04-07", contributionCount: 3 },
                          { date: "2026-04-08", contributionCount: 4 },
                        ],
                      },
                    ],
                  },
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (requestUrl.pathname === "/repos/tsilva/gadash/stats/code_frequency") {
        return new Response(
          JSON.stringify([[1_712_620_800, 10, -4]]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      throw new Error(`Unexpected fetch to ${requestUrl.href}`);
    }) as typeof fetch;

    await withEnv(
      {
        AUTH_SESSION_SECRET: "test-secret",
      },
      async () => {
        const response = await githubMetrics(
          new Request("https://gadash.tsilva.eu/api/github/metrics", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              cookie: createCookieHeader([
                {
                  name: "gadash.github",
                  value: createGitHubSessionValue(
                    "github-access-token",
                    "read:user repo",
                    "test-secret",
                  ),
                },
              ]),
            },
            body: JSON.stringify({
              staleRepos: [{ id: "1", nameWithOwner: "tsilva/gadash" }],
            }),
          }),
        );
        const payload = (await response.json()) as {
          scope: string;
          viewer: { login: string };
          repos: Array<{ nameWithOwner: string }>;
          repoLineGrowth: Array<{ repoName: string }>;
        };

        assert.equal(response.status, 200);
        assert.equal(payload.scope, "read:user repo");
        assert.equal(payload.viewer.login, "tsilva");
        assert.deepEqual(payload.repos.map((repo) => repo.nameWithOwner), ["tsilva/gadash"]);
        assert.deepEqual(payload.repoLineGrowth.map((repo) => repo.repoName), ["tsilva/gadash"]);
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("POST /api/github/sign-out clears the GitHub session cookie", async () => {
  const response = await githubSignOut();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") ?? "", /gadash\.github=;/);
});
