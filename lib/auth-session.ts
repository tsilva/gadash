const SESSION_MARKER_VALUE = "1";

type SessionStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null | undefined;

export const GOOGLE_SESSION_MARKER_KEY = "gadash.google-session";

export function hasSavedGoogleSession(storage: SessionStorageLike): boolean {
  if (!storage) {
    return false;
  }

  try {
    return storage.getItem(GOOGLE_SESSION_MARKER_KEY) === SESSION_MARKER_VALUE;
  } catch {
    return false;
  }
}

export function saveGoogleSession(storage: SessionStorageLike): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(GOOGLE_SESSION_MARKER_KEY, SESSION_MARKER_VALUE);
  } catch {
    // Ignore storage write failures; auth still works for the current tab.
  }
}

export function clearSavedGoogleSession(storage: SessionStorageLike): void {
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(GOOGLE_SESSION_MARKER_KEY);
  } catch {
    // Ignore storage removal failures; explicit sign-out still clears in-memory auth.
  }
}
