import assert from "node:assert/strict";
import test from "node:test";

import {
  GOOGLE_SESSION_MARKER_KEY,
  clearSavedGoogleSession,
  hasSavedGoogleSession,
  saveGoogleSession,
} from "../lib/auth-session.ts";

function createStorage() {
  const store = new Map<string, string>();

  return {
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

test("clearSavedGoogleSession removes the stored marker", () => {
  const storage = createStorage();

  saveGoogleSession(storage);
  clearSavedGoogleSession(storage);

  assert.equal(hasSavedGoogleSession(storage), false);
  assert.equal(storage.getItem(GOOGLE_SESSION_MARKER_KEY), null);
});
