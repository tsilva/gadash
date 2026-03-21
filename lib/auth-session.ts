const SESSION_MARKER_VALUE = "1";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null | undefined;

export const GOOGLE_SESSION_MARKER_KEY = "gadash.google-session";
export const GOOGLE_AUTH_SESSION_KEY = "gadash.google-auth";
export const GITHUB_AUTH_SESSION_KEY = "gadash.github-auth";

export type StoredGoogleAuth = {
  accessToken: string;
  expiresAt: number;
};

export type StoredGitHubAuth = {
  accessToken: string;
  scope: string;
};

export function hasSavedGoogleSession(storage: StorageLike): boolean {
  if (!storage) {
    return false;
  }

  try {
    return storage.getItem(GOOGLE_SESSION_MARKER_KEY) === SESSION_MARKER_VALUE;
  } catch {
    return false;
  }
}

export function saveGoogleSession(storage: StorageLike): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(GOOGLE_SESSION_MARKER_KEY, SESSION_MARKER_VALUE);
  } catch {
    // Ignore storage write failures; auth still works for the current tab.
  }
}

export function clearSavedGoogleSession(storage: StorageLike): void {
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(GOOGLE_SESSION_MARKER_KEY);
  } catch {
    // Ignore storage removal failures; explicit sign-out still clears in-memory auth.
  }
}

export function loadStoredGoogleAuth(
  storage: StorageLike,
  now = Date.now(),
): StoredGoogleAuth | null {
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(GOOGLE_AUTH_SESSION_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredGoogleAuth>;

    if (
      typeof parsed.accessToken !== "string" ||
      parsed.accessToken.length === 0 ||
      typeof parsed.expiresAt !== "number" ||
      !Number.isFinite(parsed.expiresAt) ||
      parsed.expiresAt <= now
    ) {
      storage.removeItem(GOOGLE_AUTH_SESSION_KEY);
      return null;
    }

    return {
      accessToken: parsed.accessToken,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    try {
      storage.removeItem(GOOGLE_AUTH_SESSION_KEY);
    } catch {
      // Ignore storage removal failures while cleaning up invalid persisted auth.
    }

    return null;
  }
}

export function saveStoredGoogleAuth(storage: StorageLike, auth: StoredGoogleAuth): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(GOOGLE_AUTH_SESSION_KEY, JSON.stringify(auth));
  } catch {
    // Ignore storage write failures; auth still works for the current tab.
  }
}

export function clearStoredGoogleAuth(storage: StorageLike): void {
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(GOOGLE_AUTH_SESSION_KEY);
  } catch {
    // Ignore storage removal failures; explicit sign-out still clears in-memory auth.
  }
}

export function loadStoredGitHubAuth(storage: StorageLike): StoredGitHubAuth | null {
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(GITHUB_AUTH_SESSION_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredGitHubAuth>;

    if (typeof parsed.accessToken !== "string" || parsed.accessToken.length === 0) {
      storage.removeItem(GITHUB_AUTH_SESSION_KEY);
      return null;
    }

    return {
      accessToken: parsed.accessToken,
      scope: typeof parsed.scope === "string" ? parsed.scope : "",
    };
  } catch {
    try {
      storage.removeItem(GITHUB_AUTH_SESSION_KEY);
    } catch {
      // Ignore storage removal failures while cleaning up invalid persisted auth.
    }

    return null;
  }
}

export function saveStoredGitHubAuth(storage: StorageLike, auth: StoredGitHubAuth): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(GITHUB_AUTH_SESSION_KEY, JSON.stringify(auth));
  } catch {
    // Ignore storage write failures; auth still works for the current tab.
  }
}

export function clearStoredGitHubAuth(storage: StorageLike): void {
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(GITHUB_AUTH_SESSION_KEY);
  } catch {
    // Ignore storage removal failures; explicit sign-out still clears in-memory auth.
  }
}
