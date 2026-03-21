import assert from "node:assert/strict";
import test from "node:test";

import {
  GITHUB_AUTH_SESSION_KEY,
  GOOGLE_AUTH_SESSION_KEY,
  GOOGLE_SESSION_MARKER_KEY,
  clearStoredGitHubAuth,
  clearStoredGoogleAuth,
  clearSavedGoogleSession,
  hasSavedGoogleSession,
  loadStoredGitHubAuth,
  loadStoredGoogleAuth,
  saveStoredGitHubAuth,
  saveGoogleSession,
  saveStoredGoogleAuth,
} from "../lib/auth-session.ts";

function createStorage() {
  const store = new Map<string, string>();

  return {
    entries() {
      return [...store.entries()];
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
}

test("saveGoogleSession persists a marker that can be read back", () => {
  const storage = createStorage();

  assert.equal(hasSavedGoogleSession(storage), false);

  saveGoogleSession(storage);

  assert.equal(storage.getItem(GOOGLE_SESSION_MARKER_KEY), "1");
  assert.equal(hasSavedGoogleSession(storage), true);
});

test("saveGoogleSession stores only the marker and never an access token", () => {
  const storage = createStorage();

  saveGoogleSession(storage);

  assert.deepEqual(storage.entries(), [[GOOGLE_SESSION_MARKER_KEY, "1"]]);
});

test("clearSavedGoogleSession removes the stored marker", () => {
  const storage = createStorage();

  saveGoogleSession(storage);
  clearSavedGoogleSession(storage);

  assert.equal(hasSavedGoogleSession(storage), false);
  assert.equal(storage.getItem(GOOGLE_SESSION_MARKER_KEY), null);
});

test("saveStoredGoogleAuth persists a tab-scoped token payload", () => {
  const storage = createStorage();

  saveStoredGoogleAuth(storage, {
    accessToken: "access-token",
    expiresAt: 2_000,
  });

  assert.deepEqual(JSON.parse(storage.getItem(GOOGLE_AUTH_SESSION_KEY) ?? "null"), {
    accessToken: "access-token",
    expiresAt: 2_000,
  });
});

test("loadStoredGoogleAuth returns a valid unexpired token payload", () => {
  const storage = createStorage();

  saveStoredGoogleAuth(storage, {
    accessToken: "access-token",
    expiresAt: 2_000,
  });

  assert.deepEqual(loadStoredGoogleAuth(storage, 1_000), {
    accessToken: "access-token",
    expiresAt: 2_000,
  });
});

test("loadStoredGoogleAuth rejects expired payloads and removes them", () => {
  const storage = createStorage();

  saveStoredGoogleAuth(storage, {
    accessToken: "expired-token",
    expiresAt: 1_000,
  });

  assert.equal(loadStoredGoogleAuth(storage, 1_000), null);
  assert.equal(storage.getItem(GOOGLE_AUTH_SESSION_KEY), null);
});

test("clearStoredGoogleAuth removes the persisted token payload", () => {
  const storage = createStorage();

  saveStoredGoogleAuth(storage, {
    accessToken: "access-token",
    expiresAt: 2_000,
  });
  clearStoredGoogleAuth(storage);

  assert.equal(storage.getItem(GOOGLE_AUTH_SESSION_KEY), null);
});

test("saveStoredGitHubAuth persists a tab-scoped token payload", () => {
  const storage = createStorage();

  saveStoredGitHubAuth(storage, {
    accessToken: "github-token",
    scope: "read:user repo",
  });

  assert.deepEqual(JSON.parse(storage.getItem(GITHUB_AUTH_SESSION_KEY) ?? "null"), {
    accessToken: "github-token",
    scope: "read:user repo",
  });
});

test("loadStoredGitHubAuth returns a valid token payload", () => {
  const storage = createStorage();

  saveStoredGitHubAuth(storage, {
    accessToken: "github-token",
    scope: "read:user repo",
  });

  assert.deepEqual(loadStoredGitHubAuth(storage), {
    accessToken: "github-token",
    scope: "read:user repo",
  });
});

test("clearStoredGitHubAuth removes the persisted token payload", () => {
  const storage = createStorage();

  saveStoredGitHubAuth(storage, {
    accessToken: "github-token",
    scope: "read:user repo",
  });
  clearStoredGitHubAuth(storage);

  assert.equal(storage.getItem(GITHUB_AUTH_SESSION_KEY), null);
});
