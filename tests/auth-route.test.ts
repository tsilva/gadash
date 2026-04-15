import assert from "node:assert/strict";
import test from "node:test";

import { POST as createGoogleSession } from "../app/api/auth/google/session/route.ts";
import { POST as signOut } from "../app/api/auth/sign-out/route.ts";

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

test("POST /api/auth/google/session creates a cookie for the allowed Google account", async () => {
  const originalFetch = global.fetch;

  try {
    global.fetch = (async () =>
      new Response(
        JSON.stringify({
          aud: "test-client-id.apps.googleusercontent.com",
          email: "eng.tiago.silva@gmail.com",
          email_verified: "true",
          exp: `${Math.floor(Date.now() / 1000) + 300}`,
          iss: "https://accounts.google.com",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    await withEnv(
      {
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
        AUTH_SESSION_SECRET: "test-secret",
        ALLOWED_GOOGLE_EMAILS: "eng.tiago.silva@gmail.com",
      },
      async () => {
        const response = await createGoogleSession(
          new Request("https://gadash.tsilva.eu/api/auth/google/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential: "header.payload.signature" }),
          }),
        );
        const payload = (await response.json()) as { ok: boolean; email: string };

        assert.equal(response.status, 200);
        assert.equal(payload.ok, true);
        assert.equal(payload.email, "eng.tiago.silva@gmail.com");
        assert.match(response.headers.get("set-cookie") ?? "", /gadash\.auth=/);
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("POST /api/auth/google/session allows local sign-in without AUTH_SESSION_SECRET outside production", async () => {
  const originalFetch = global.fetch;

  try {
    global.fetch = (async () =>
      new Response(
        JSON.stringify({
          aud: "test-client-id.apps.googleusercontent.com",
          email: "eng.tiago.silva@gmail.com",
          email_verified: "true",
          exp: `${Math.floor(Date.now() / 1000) + 300}`,
          iss: "https://accounts.google.com",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    await withEnv(
      {
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
        AUTH_SESSION_SECRET: undefined,
        ALLOWED_GOOGLE_EMAILS: "eng.tiago.silva@gmail.com",
        NODE_ENV: "development",
      },
      async () => {
        const response = await createGoogleSession(
          new Request("https://gadash.tsilva.eu/api/auth/google/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential: "header.payload.signature" }),
          }),
        );
        const payload = (await response.json()) as { ok: boolean; email: string };

        assert.equal(response.status, 200);
        assert.equal(payload.ok, true);
        assert.equal(payload.email, "eng.tiago.silva@gmail.com");
        assert.match(response.headers.get("set-cookie") ?? "", /gadash\.auth=/);
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("POST /api/auth/google/session rejects an unallowed email", async () => {
  const originalFetch = global.fetch;

  try {
    global.fetch = (async () =>
      new Response(
        JSON.stringify({
          aud: "test-client-id.apps.googleusercontent.com",
          email: "other@example.com",
          email_verified: "true",
          exp: `${Math.floor(Date.now() / 1000) + 300}`,
          iss: "https://accounts.google.com",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    await withEnv(
      {
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
        AUTH_SESSION_SECRET: "test-secret",
        ALLOWED_GOOGLE_EMAILS: "eng.tiago.silva@gmail.com",
      },
      async () => {
        const response = await createGoogleSession(
          new Request("https://gadash.tsilva.eu/api/auth/google/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential: "header.payload.signature" }),
          }),
        );
        const payload = (await response.json()) as { error: string };

        assert.equal(response.status, 403);
        assert.equal(payload.error, "This Google account is not allowed to access GADash.");
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("POST /api/auth/google/session rejects unverified emails", async () => {
  const originalFetch = global.fetch;

  try {
    global.fetch = (async () =>
      new Response(
        JSON.stringify({
          aud: "test-client-id.apps.googleusercontent.com",
          email: "eng.tiago.silva@gmail.com",
          email_verified: "false",
          exp: `${Math.floor(Date.now() / 1000) + 300}`,
          iss: "https://accounts.google.com",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    await withEnv(
      {
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
        AUTH_SESSION_SECRET: "test-secret",
        ALLOWED_GOOGLE_EMAILS: "eng.tiago.silva@gmail.com",
      },
      async () => {
        const response = await createGoogleSession(
          new Request("https://gadash.tsilva.eu/api/auth/google/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential: "header.payload.signature" }),
          }),
        );
        const payload = (await response.json()) as { error: string };

        assert.equal(response.status, 401);
        assert.equal(payload.error, "Google identity credential is invalid.");
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("POST /api/auth/google/session rejects tokens for the wrong audience", async () => {
  const originalFetch = global.fetch;

  try {
    global.fetch = (async () =>
      new Response(
        JSON.stringify({
          aud: "different-client-id.apps.googleusercontent.com",
          email: "eng.tiago.silva@gmail.com",
          email_verified: "true",
          exp: `${Math.floor(Date.now() / 1000) + 300}`,
          iss: "https://accounts.google.com",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    await withEnv(
      {
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
        AUTH_SESSION_SECRET: "test-secret",
        ALLOWED_GOOGLE_EMAILS: "eng.tiago.silva@gmail.com",
      },
      async () => {
        const response = await createGoogleSession(
          new Request("https://gadash.tsilva.eu/api/auth/google/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential: "header.payload.signature" }),
          }),
        );
        const payload = (await response.json()) as { error: string };

        assert.equal(response.status, 401);
        assert.equal(payload.error, "Google identity credential is invalid.");
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("POST /api/auth/google/session rejects malformed payloads", async () => {
  const response = await createGoogleSession(
    new Request("https://gadash.tsilva.eu/api/auth/google/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }),
  );
  const payload = (await response.json()) as { error: string };

  assert.equal(response.status, 400);
  assert.equal(payload.error, "Invalid Google sign-in request payload.");
});

test("POST /api/auth/google/session still requires AUTH_SESSION_SECRET in production", async () => {
  const originalFetch = global.fetch;

  try {
    global.fetch = (async () =>
      new Response(
        JSON.stringify({
          aud: "test-client-id.apps.googleusercontent.com",
          email: "eng.tiago.silva@gmail.com",
          email_verified: "true",
          exp: `${Math.floor(Date.now() / 1000) + 300}`,
          iss: "https://accounts.google.com",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    await withEnv(
      {
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
        AUTH_SESSION_SECRET: undefined,
        ALLOWED_GOOGLE_EMAILS: "eng.tiago.silva@gmail.com",
        NODE_ENV: "production",
      },
      async () => {
        const response = await createGoogleSession(
          new Request("https://gadash.tsilva.eu/api/auth/google/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential: "header.payload.signature" }),
          }),
        );
        const payload = (await response.json()) as { error: string };

        assert.equal(response.status, 500);
        assert.equal(payload.error, "Missing AUTH_SESSION_SECRET server configuration.");
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("POST /api/auth/sign-out clears the dashboard and GitHub session cookies", async () => {
  const response = await signOut();
  const setCookie = response.headers.get("set-cookie") ?? "";

  assert.equal(response.status, 200);
  assert.match(setCookie, /gadash\.auth=;/);
  assert.match(setCookie, /gadash\.github=;/);
});
