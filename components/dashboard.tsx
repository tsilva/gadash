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

import { dashboardProperties, getAuthorizedOrigins, getGoogleClientId } from "@/lib/config";
import { summarizeSnapshots, getEmptySnapshot } from "@/lib/dashboard";
import { fetchPropertyRealtimeSnapshot } from "@/lib/ga4";
import type { PropertyRealtimeSnapshot } from "@/lib/types";

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

  if (dashboardProperties.length === 0) {
    return "Set NEXT_PUBLIC_GA_PROPERTIES_JSON with at least one GA4 property.";
  }

  if (!isAuthorizedOrigin()) {
    return `This origin is not allowed for Google OAuth: ${window.location.origin}`;
  }

  return null;
}

function createLoadingState(): PropertyRealtimeSnapshot[] {
  return dashboardProperties.map((property) => getEmptySnapshot(property.id, property.label));
}

export function Dashboard() {
  const [phase, setPhase] = useState<"signed_out" | "authorizing" | "loading" | "loaded">(
    "signed_out",
  );
  const [scriptReady, setScriptReady] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [snapshots, setSnapshots] = useState<PropertyRealtimeSnapshot[]>(createLoadingState);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const tokenClientRef = useRef<GoogleTokenClient | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const snapshotsRef = useRef<PropertyRealtimeSnapshot[]>(snapshots);
  const refreshDataRef = useRef<() => Promise<void>>(async () => undefined);
  const refreshTimerRef = useRef<number | null>(null);
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
      dashboardProperties.map((property) => fetchPropertyRealtimeSnapshot(property, activeToken)),
    );

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

  const requestAccessToken = useCallback((prompt: "" | "consent" | "select_account") => {
    if (!tokenClientRef.current) {
      setGlobalError("Google sign-in is not ready yet.");
      return;
    }

    setPhase("authorizing");
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
          setGlobalError(response.error_description ?? response.error ?? "Google sign-in failed.");
          setPhase("signed_out");
          return;
        }

        setAccessToken(response.access_token);
        setExpiresAt(Date.now() + response.expires_in * 1000);
        setGlobalError(null);
        setStale(false);
        setPhase("loading");
      },
      error_callback: (error) => {
        setPhase("signed_out");
        setGlobalError(`Google sign-in failed: ${error.type}`);
      },
    });
  }, [configError, scriptReady]);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

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

    queueMicrotask(() => {
      void refreshDataRef.current();
    });
  }, [accessToken, clearRefreshTimer]);

  useEffect(() => {
    if (!accessToken || !expiresAt) {
      return;
    }

    const msUntilRefresh = Math.max(expiresAt - Date.now() - 60_000, 5_000);
    const timer = window.setTimeout(() => {
      requestAccessToken("");
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

    setAccessToken(null);
    setExpiresAt(null);
    setSnapshots(createLoadingState());
    setStale(false);
    setGlobalError(null);
    setPhase("signed_out");
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
        <section className="hero">
          <div className="hero__copy">
            <p className="eyebrow">GA4 Realtime cockpit</p>
            <h1>Live users across your configured properties.</h1>
            <p className="hero__lede">
              Viewer-scoped totals, near-now activity, and graceful partial results for teams that
              live in multiple GA4 properties.
            </p>
          </div>
          <div className="hero__actions">
            {accessToken ? (
              <button className="button button--ghost" onClick={signOut} type="button">
                Sign out
              </button>
            ) : (
              <button
                className="button"
                disabled={authState === "authorizing" || Boolean(configError)}
                onClick={() => requestAccessToken("consent")}
                type="button"
              >
                {authState === "authorizing" ? "Authorizing..." : "Sign in with Google"}
              </button>
            )}
          </div>
        </section>

        <section className="status-bar">
          <span>{accessToken ? "Signed in to Google Analytics" : "Signed out"}</span>
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
              {summary.accessibleCount}/{dashboardProperties.length}
            </strong>
            <span>
              {summary.inaccessibleCount} inaccessible, {summary.errorCount} failed
            </span>
          </article>
        </section>

        <section className="properties">
          {dashboardProperties.map((property) => {
            const snapshot =
              deferredSnapshots.find((entry) => entry.propertyId === property.id) ??
              getEmptySnapshot(property.id, property.label);

            return (
              <article className="property-card" key={property.id}>
                <div className="property-card__header">
                  <div>
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
