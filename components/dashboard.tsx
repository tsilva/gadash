"use client";

import Script from "next/script";
import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";

import { discoverDashboardProperties } from "@/lib/admin";
import {
  configuredDashboardProperties,
  getAuthorizedOrigins,
  getGoogleClientId,
} from "@/lib/config";
import {
  clearSavedGoogleSession,
  hasSavedGoogleSession,
  saveGoogleSession,
} from "@/lib/auth-session";
import { summarizeSnapshots, getEmptySnapshot } from "@/lib/dashboard";
import { fetchPropertyRealtimeSnapshot } from "@/lib/ga4";
import type { DashboardProperty, PropertyRealtimeSnapshot } from "@/lib/types";

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const POLL_INTERVAL_MS = 30_000;

type AuthState = "checking" | "ready" | "signed_out" | "authorizing" | "loading" | "loaded";

function formatCount(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US").format(value);
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Not fetched yet";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function isAuthorizedOrigin(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  const allowedOrigins = getAuthorizedOrigins();

  if (allowedOrigins.length === 0) {
    return true;
  }

  return allowedOrigins.includes(window.location.origin);
}

function getConfigError(): string | null {
  if (getGoogleClientId().length === 0) {
    return "Set NEXT_PUBLIC_GOOGLE_CLIENT_ID before using the dashboard.";
  }

  if (!isAuthorizedOrigin()) {
    return `This origin is not allowed for Google OAuth: ${window.location.origin}`;
  }

  return null;
}

function createLoadingState(properties: DashboardProperty[]): PropertyRealtimeSnapshot[] {
  return properties.map((property) => getEmptySnapshot(property.id, property.label));
}

function GoogleMark() {
  return (
    <svg
      aria-hidden="true"
      className="google-signin__icon"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M17.64 9.2c0-.64-.06-1.26-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.56 2.68-3.86 2.68-6.62Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.97 10.72A5.41 5.41 0 0 1 3.69 9c0-.6.1-1.18.28-1.72V4.94H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.06l3.01-2.34Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.32 0 2.5.45 3.44 1.33l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34c.7-2.12 2.69-3.7 5.03-3.7Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function Dashboard() {
  const [phase, setPhase] = useState<"signed_out" | "authorizing" | "loading" | "loaded">(
    "signed_out",
  );
  const [scriptReady, setScriptReady] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [properties, setProperties] = useState<DashboardProperty[]>(configuredDashboardProperties);
  const [snapshots, setSnapshots] = useState<PropertyRealtimeSnapshot[]>(
    createLoadingState(configuredDashboardProperties),
  );
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const tokenClientRef = useRef<GoogleTokenClient | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const propertiesRef = useRef<DashboardProperty[]>(properties);
  const snapshotsRef = useRef<PropertyRealtimeSnapshot[]>(snapshots);
  const refreshDataRef = useRef<() => Promise<void>>(async () => undefined);
  const refreshTimerRef = useRef<number | null>(null);
  const lastPromptRef = useRef<GoogleTokenRequest["prompt"] | undefined>(undefined);
  const silentRestoreAttemptedRef = useRef(false);
  const deferredSnapshots = useDeferredValue(snapshots);
  const configError = getConfigError();
  const authState: AuthState =
    !scriptReady && !configError
      ? "checking"
      : phase === "authorizing"
        ? "authorizing"
        : accessToken
          ? phase === "loading"
            ? "loading"
            : "loaded"
          : "signed_out";

  const summary = summarizeSnapshots(deferredSnapshots);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const refreshData = useCallback(async () => {
    const activeToken = accessTokenRef.current;

    if (!activeToken) {
      return;
    }

    startTransition(() => {
      setPhase("loading");
    });

    const nextSnapshots = await Promise.all(
      propertiesRef.current.map((property) => fetchPropertyRealtimeSnapshot(property, activeToken)),
    );

    if (propertiesRef.current.length === 0) {
      setSnapshots([]);
      setGlobalError("No GA4 properties were discovered for this Google account.");
      setPhase("loaded");
      clearRefreshTimer();
      return;
    }

    const hasAccessibleProperty = nextSnapshots.some((snapshot) => snapshot.status === "ok");
    const hasBlockingErrors = nextSnapshots.every((snapshot) => snapshot.status !== "ok");

    if (
      !hasAccessibleProperty &&
      hasBlockingErrors &&
      snapshotsRef.current.some((snapshot) => snapshot.fetchedAt)
    ) {
      setStale(true);
      setGlobalError("Could not refresh live data. Showing the last successful snapshot.");
      clearRefreshTimer();
      refreshTimerRef.current = window.setTimeout(() => {
        void refreshDataRef.current();
      }, POLL_INTERVAL_MS);
      setPhase("loaded");
      return;
    }

    setSnapshots(nextSnapshots);
    setStale(false);
    setGlobalError(
      nextSnapshots.some((snapshot) => snapshot.status === "error")
        ? "Some properties failed to refresh. Totals only include successful properties."
        : null,
    );
    setPhase("loaded");
    clearRefreshTimer();
    refreshTimerRef.current = window.setTimeout(() => {
      void refreshDataRef.current();
    }, POLL_INTERVAL_MS);
  }, [clearRefreshTimer]);

  const resetSignedOutState = useCallback(
    (message: string | null) => {
      clearRefreshTimer();
      accessTokenRef.current = null;
      setAccessToken(null);
      setExpiresAt(null);
      setProperties(configuredDashboardProperties);
      setSnapshots(createLoadingState(configuredDashboardProperties));
      setStale(false);
      setGlobalError(message);
      setPhase("signed_out");
    },
    [clearRefreshTimer],
  );

  const requestAccessToken = useCallback((prompt: "" | "none" | "consent" | "select_account") => {
    if (!tokenClientRef.current) {
      setGlobalError("Google sign-in is not ready yet.");
      return;
    }

    lastPromptRef.current = prompt;

    if (prompt === "consent" || prompt === "select_account") {
      setPhase("authorizing");
    }

    tokenClientRef.current.requestAccessToken({ prompt });
  }, []);

  useEffect(() => {
    if (!scriptReady || configError) {
      return;
    }

    if (!window.google?.accounts.oauth2) {
      return;
    }

    tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
      client_id: getGoogleClientId(),
      scope: GOOGLE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          const isSilentRequest = lastPromptRef.current === "none";

          clearSavedGoogleSession(window.localStorage);
          resetSignedOutState(
            isSilentRequest ? null : (response.error_description ?? response.error ?? "Google sign-in failed."),
          );
          return;
        }

        saveGoogleSession(window.localStorage);
        setAccessToken(response.access_token);
        setExpiresAt(Date.now() + response.expires_in * 1000);
        setGlobalError(null);
        setStale(false);
        setPhase("loading");
      },
      error_callback: (error) => {
        const isSilentRequest = lastPromptRef.current === "none";

        clearSavedGoogleSession(window.localStorage);
        resetSignedOutState(isSilentRequest ? null : `Google sign-in failed: ${error.type}`);
      },
    });

    if (!silentRestoreAttemptedRef.current && hasSavedGoogleSession(window.localStorage)) {
      silentRestoreAttemptedRef.current = true;
      queueMicrotask(() => {
        requestAccessToken("none");
      });
    }
  }, [configError, requestAccessToken, resetSignedOutState, scriptReady]);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    propertiesRef.current = properties;
  }, [properties]);

  useEffect(() => {
    snapshotsRef.current = snapshots;
  }, [snapshots]);

  useEffect(() => {
    refreshDataRef.current = refreshData;
  }, [refreshData]);

  useEffect(() => {
    if (!accessToken) {
      clearRefreshTimer();
      return;
    }

    queueMicrotask(async () => {
      try {
        const discoveredProperties = await discoverDashboardProperties(accessToken);

        if (discoveredProperties.length === 0) {
          setProperties([]);
          setSnapshots([]);
          setGlobalError("No GA4 properties were discovered for this Google account.");
          setStale(false);
          setPhase("loaded");
          return;
        }

        propertiesRef.current = discoveredProperties;
        setProperties(discoveredProperties);
        setSnapshots(createLoadingState(discoveredProperties));
        setGlobalError(null);
        setStale(false);
        void refreshDataRef.current();
      } catch (error) {
        setProperties(configuredDashboardProperties);
        setSnapshots(createLoadingState(configuredDashboardProperties));
        setGlobalError(
          error instanceof Error
            ? `Property discovery failed: ${error.message}`
            : "Property discovery failed.",
        );
        setPhase("signed_out");
        setAccessToken(null);
        setExpiresAt(null);
        clearSavedGoogleSession(window.localStorage);
      }
    });
  }, [accessToken, clearRefreshTimer]);

  useEffect(() => {
    if (!accessToken || !expiresAt) {
      return;
    }

    const msUntilRefresh = Math.max(expiresAt - Date.now() - 60_000, 5_000);
    const timer = window.setTimeout(() => {
      requestAccessToken("none");
    }, msUntilRefresh);

    return () => window.clearTimeout(timer);
  }, [accessToken, expiresAt, requestAccessToken]);

  useEffect(() => {
    return () => clearRefreshTimer();
  }, [clearRefreshTimer]);

  function signOut() {
    clearRefreshTimer();

    if (accessToken && window.google?.accounts.oauth2) {
      window.google.accounts.oauth2.revoke(accessToken, () => undefined);
    }

    clearSavedGoogleSession(window.localStorage);
    resetSignedOutState(null);
  }

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => {
          setScriptReady(true);

          if (!window.google?.accounts.oauth2) {
            setGlobalError("Google Identity Services failed to load.");
          }
        }}
      />
      <main className="shell">
        <header className="hero">
          <div className="hero__copy">
            <h1>GADash</h1>
            <p className="hero__lede">Realtime GA4 dashboard</p>
          </div>
          <div className="hero__actions">
            {accessToken ? (
              <button className="button button--ghost" onClick={signOut} type="button">
                Sign out
              </button>
            ) : (
              <button
                className="button button--google"
                disabled={authState === "authorizing" || Boolean(configError)}
                onClick={() => requestAccessToken("consent")}
                type="button"
              >
                <span className="google-signin">
                  <span className="google-signin__badge">
                    <GoogleMark />
                  </span>
                  <span className="google-signin__label">
                    {authState === "authorizing" ? "Authorizing..." : "Sign in with Google"}
                  </span>
                </span>
              </button>
            )}
          </div>
        </header>

        <section className="status-bar">
          <span className={accessToken ? "status-bar__live-dot" : ""}>{accessToken ? "Live" : "Signed out"}</span>
          <span>{stale ? "Showing previous snapshot" : `Updated ${formatTimestamp(summary.fetchedAt)}`}</span>
        </section>

        {configError ? (
          <section className="alert alert--error">
            <h2>Configuration required</h2>
            <p>{configError}</p>
          </section>
        ) : null}

        {globalError ? (
          <section className="alert alert--warning">
            <h2>{summary.isPartial || stale ? "Partial results" : "Sign-in issue"}</h2>
            <p>{globalError}</p>
          </section>
        ) : null}

        <section className="summary-grid">
          <article className="summary-card">
            <p className="summary-card__label">Online now proxy</p>
            <strong>{formatCount(summary.totalNearNowActiveUsers)}</strong>
            <span>Active users in the last 0-4 minutes</span>
          </article>
          <article className="summary-card">
            <p className="summary-card__label">Last 30 minutes</p>
            <strong>{formatCount(summary.totalLast30MinActiveUsers)}</strong>
            <span>Steadier executive summary</span>
          </article>
          <article className="summary-card">
            <p className="summary-card__label">Coverage</p>
            <strong>
              {summary.accessibleCount}/{properties.length}
            </strong>
            <span>
              {summary.inaccessibleCount} inaccessible, {summary.errorCount} failed
            </span>
          </article>
        </section>

        <section className="properties">
          {properties.map((property) => {
            const snapshot =
              deferredSnapshots.find((entry) => entry.propertyId === property.id) ??
              getEmptySnapshot(property.id, property.label);

            return (
              <article className="property-card" key={property.id}>
                <div className="property-card__header">
                  <div className="property-card__title">
                    <p className="property-card__label">Property</p>
                    <h2>{snapshot.label}</h2>
                  </div>
                  <span className={`pill pill--${snapshot.status}`}>{snapshot.status.replace("_", " ")}</span>
                </div>

                <dl className="property-card__metrics">
                  <div>
                    <dt>0-4 min</dt>
                    <dd>{formatCount(snapshot.nearNowActiveUsers)}</dd>
                  </div>
                  <div>
                    <dt>30 min</dt>
                    <dd>{formatCount(snapshot.last30MinActiveUsers)}</dd>
                  </div>
                </dl>

                <div className="property-card__footer">
                  <span>ID {snapshot.propertyId}</span>
                  <span>{formatTimestamp(snapshot.fetchedAt)}</span>
                </div>

                {snapshot.errorMessage ? <p className="property-card__error">{snapshot.errorMessage}</p> : null}
              </article>
            );
          })}
        </section>
      </main>
    </>
  );
}
