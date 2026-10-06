import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { proxy } from "../proxy.ts";
import { buildContentSecurityPolicy, getSecurityHeaders } from "../lib/security-headers.ts";

test("buildContentSecurityPolicy includes a nonce and required Google origins", () => {
  const policy = buildContentSecurityPolicy("nonce123", true);

  assert.match(
    policy,
    /script-src 'self' https:\/\/accounts\.google\.com https:\/\/www\.googletagmanager\.com 'nonce-nonce123'/,
  );
  assert.match(policy, /frame-src 'self' https:\/\/accounts\.google\.com/);
  assert.match(
    policy,
    /connect-src 'self' https:\/\/analyticsadmin\.googleapis\.com https:\/\/analyticsdata\.googleapis\.com https:\/\/www\.google-analytics\.com https:\/\/region1\.google-analytics\.com https:\/\/accounts\.google\.com https:\/\/oauth2\.googleapis\.com https:\/\/api\.github\.com/,
  );
  assert.match(
    policy,
    /img-src 'self' data: https:\/\/www\.google-analytics\.com https:\/\/www\.googletagmanager\.com/,
  );
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /upgrade-insecure-requests/);
  assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/);
});

test("buildContentSecurityPolicy adds dev-only script and websocket allowances", () => {
  const policy = buildContentSecurityPolicy("nonce123", false);

  assert.match(policy, /'unsafe-eval'/);
  assert.match(policy, /ws:/);
  assert.doesNotMatch(policy, /upgrade-insecure-requests/);
});

test("CSP permits only the configured Sentry ingestion origin without exposing its key", () => {
  const policy = buildContentSecurityPolicy(
    "nonce123",
    true,
    " https://example-public-key@o123.ingest.de.sentry.io/456 ",
  );
  const connectSrc = policy.split("; ").find((directive) => directive.startsWith("connect-src "));

  assert.ok(connectSrc?.split(" ").includes("https://o123.ingest.de.sentry.io"));
  assert.doesNotMatch(policy, /example-public-key|\/456|\*\.sentry\.io/);
  assert.doesNotMatch(policy, /script-src[^;]*sentry/);
});

test("CSP remains unchanged for missing, invalid, or unsafe Sentry URLs", () => {
  const baseline = buildContentSecurityPolicy("nonce123", true);

  for (const dsn of [undefined, "", "invalid", "http://key@sentry.example/1", "javascript:alert(1)", "https://*.sentry.io/1", "https://sentry.example;evil/1"]) {
    assert.equal(buildContentSecurityPolicy("nonce123", true, dsn), baseline);
  }
});

test("proxy passes the browser DSN to the response CSP", () => {
  const previous = process.env.NEXT_PUBLIC_SENTRY_DSN;
  process.env.NEXT_PUBLIC_SENTRY_DSN = "https://example-public-key@sentry.example:8443/123";

  try {
    const response = proxy(new NextRequest("https://gadash.tsilva.eu/"));
    const policy = response.headers.get("Content-Security-Policy") ?? "";

    assert.match(policy, /connect-src[^;]*https:\/\/sentry\.example:8443/);
    assert.doesNotMatch(policy, /example-public-key/);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    else process.env.NEXT_PUBLIC_SENTRY_DSN = previous;
  }
});

test("getSecurityHeaders returns the expected non-CSP headers", () => {
  const headers = getSecurityHeaders("nonce123", true);
  const headerMap = new Map(headers.map((header) => [header.key, header.value]));

  assert.equal(headerMap.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(headerMap.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headerMap.get("Permissions-Policy"), "camera=(), microphone=(), geolocation=()");
  assert.equal(headerMap.get("X-Frame-Options"), "DENY");
});

test("proxy applies the security headers to app routes", () => {
  const response = proxy(new NextRequest("https://gadash.tsilva.eu/"));
  const policy = response.headers.get("Content-Security-Policy") ?? "";

  assert.match(
    policy,
    /script-src 'self' https:\/\/accounts\.google\.com https:\/\/www\.googletagmanager\.com 'nonce-/,
  );
  assert.equal(response.headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Permissions-Policy"), "camera=(), microphone=(), geolocation=()");
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");
});
