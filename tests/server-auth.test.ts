import assert from "node:assert/strict";
import test from "node:test";

import {
  createDashboardSessionValue,
  createGitHubSessionValue,
  parseAllowedGoogleEmails,
  readDashboardSessionValue,
  readGitHubSessionValue,
} from "../lib/server-auth.ts";

test("parseAllowedGoogleEmails normalizes, deduplicates, and trims entries", () => {
  assert.deepEqual(
    parseAllowedGoogleEmails(" Eng.Tiago.Silva@gmail.com, eng.tiago.silva@gmail.com , second@example.com "),
    ["eng.tiago.silva@gmail.com", "second@example.com"],
  );
});

test("readDashboardSessionValue returns a valid signed session payload", () => {
  const sessionValue = createDashboardSessionValue("eng.tiago.silva@gmail.com", "test-secret", 1_000);

  assert.deepEqual(readDashboardSessionValue(sessionValue, "test-secret", 5_000), {
    email: "eng.tiago.silva@gmail.com",
    issuedAt: 1_000,
    expiresAt: 86_401_000,
  });
});

test("readDashboardSessionValue rejects tampered session values", () => {
  const sessionValue = createDashboardSessionValue("eng.tiago.silva@gmail.com", "test-secret", 1_000);
  const tamperedValue = `${sessionValue.slice(0, -1)}${sessionValue.endsWith("a") ? "b" : "a"}`;

  assert.equal(readDashboardSessionValue(tamperedValue, "test-secret", 5_000), null);
});

test("readDashboardSessionValue rejects expired session values", () => {
  const sessionValue = createDashboardSessionValue("eng.tiago.silva@gmail.com", "test-secret", 1_000, 1);

  assert.equal(readDashboardSessionValue(sessionValue, "test-secret", 3_000), null);
});

test("readGitHubSessionValue returns a valid signed session payload", () => {
  const sessionValue = createGitHubSessionValue(
    "github-access-token",
    "read:user repo",
    "test-secret",
    1_000,
  );

  assert.deepEqual(readGitHubSessionValue(sessionValue, "test-secret", 5_000), {
    accessToken: "github-access-token",
    scope: "read:user repo",
    issuedAt: 1_000,
    expiresAt: 86_401_000,
  });
});

test("readGitHubSessionValue rejects tampered session values", () => {
  const sessionValue = createGitHubSessionValue(
    "github-access-token",
    "read:user repo",
    "test-secret",
    1_000,
  );
  const tamperedValue = `${sessionValue.slice(0, -1)}${sessionValue.endsWith("a") ? "b" : "a"}`;

  assert.equal(readGitHubSessionValue(tamperedValue, "test-secret", 5_000), null);
});

test("readGitHubSessionValue rejects expired session values", () => {
  const sessionValue = createGitHubSessionValue(
    "github-access-token",
    "read:user repo",
    "test-secret",
    1_000,
    1,
  );

  assert.equal(readGitHubSessionValue(sessionValue, "test-secret", 3_000), null);
});
