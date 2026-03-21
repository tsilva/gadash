import { createEmptyGitHubHistory } from "@/lib/dashboard";
import type { GitHubHistoryStore } from "@/lib/types";

const DB_NAME = "gadash-github";
const STORE_NAME = "history";
const DB_VERSION = 1;

function getStorageKey(login: string): string {
  return login.toLowerCase();
}

function openHistoryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "login" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openHistoryDb();

  try {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const result = await handler(store);

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    });

    return result;
  } finally {
    db.close();
  }
}

export async function loadGitHubHistory(login: string): Promise<GitHubHistoryStore> {
  try {
    return await withStore("readonly", (store) => {
      return new Promise<GitHubHistoryStore>((resolve, reject) => {
        const request = store.get(getStorageKey(login));

        request.onsuccess = () => {
          const value = request.result as GitHubHistoryStore | undefined;
          resolve(value ?? createEmptyGitHubHistory(login));
        };
        request.onerror = () =>
          reject(request.error ?? new Error("Could not read GitHub history from IndexedDB."));
      });
    });
  } catch {
    return createEmptyGitHubHistory(login);
  }
}

export async function saveGitHubHistory(history: GitHubHistoryStore): Promise<void> {
  try {
    await withStore("readwrite", (store) => {
      return new Promise<void>((resolve, reject) => {
        const request = store.put({
          ...history,
          login: getStorageKey(history.login),
        });

        request.onsuccess = () => resolve();
        request.onerror = () =>
          reject(request.error ?? new Error("Could not write GitHub history to IndexedDB."));
      });
    });
  } catch {
    // Ignore persistence failures. The dashboard still works for the current session.
  }
}

export async function clearGitHubHistory(login: string): Promise<void> {
  try {
    await withStore("readwrite", (store) => {
      return new Promise<void>((resolve, reject) => {
        const request = store.delete(getStorageKey(login));

        request.onsuccess = () => resolve();
        request.onerror = () =>
          reject(request.error ?? new Error("Could not remove GitHub history from IndexedDB."));
      });
    });
  } catch {
    // Ignore persistence failures.
  }
}
