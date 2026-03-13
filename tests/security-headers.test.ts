import assert from "node:assert/strict";
import test from "node:test";

import nextConfig from "../next.config.ts";
import { buildContentSecurityPolicy, getSecurityHeaders } from "../lib/security-headers.ts";

test("buildContentSecurityPolicy includes required Google origins and framing protections", () => {
  const policy = buildContentSecurityPolicy(false);

  assert.match(policy, /script-src 'self' 'unsafe-inline' https:\/\/accounts\.google\.com/);
  assert.match(
    policy,
    /connect-src 'self' https:\/\/analyticsadmin\.googleapis\.com https:\/\/analyticsdata\.googleapis\.com https:\/\/accounts\.google\.com https:\/\/oauth2\.googleapis\.com/,
  );
  assert.match(policy, /frame-ancestors 'none'/);
  assert.doesNotMatch(policy, /upgrade-insecure-requests/);
});

test("buildContentSecurityPolicy adds upgrade-insecure-requests in production", () => {
  const policy = buildContentSecurityPolicy(true);

  assert.match(policy, /upgrade-insecure-requests/);
});

test("getSecurityHeaders returns the expected non-CSP headers", () => {
  const headers = getSecurityHeaders(false);
  const headerMap = new Map(headers.map((header) => [header.key, header.value]));

  assert.equal(headerMap.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(headerMap.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headerMap.get("Permissions-Policy"), "camera=(), microphone=(), geolocation=()");
  assert.equal(headerMap.get("X-Frame-Options"), "DENY");
});

test("next config applies the security headers to app routes", async () => {
  const routes = await nextConfig.headers?.();

  assert.deepEqual(routes, [
    {
      source: "/:path*",
      headers: getSecurityHeaders(false),
    },
  ]);
});
