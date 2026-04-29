"use client";

import Script from "next/script";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";

import { GoogleMark } from "@/components/google-mark";
import { LockedDataRegion } from "@/components/locked-data-region";
import { PageSpeedSection } from "@/components/pagespeed-section";
import { discoverDashboardProperties, discoverPageSpeedSites } from "@/lib/admin";
import {
  configuredDashboardProperties,
  getGitHubAuthorizedOrigins,
  getGitHubClientId,
  getGoogleAuthorizedOrigins,
  getGoogleClientId,
} from "@/lib/config";
import {
  clearStoredGoogleAuth,
  clearSavedGoogleSession,
  hasSavedGoogleSession,
  loadStoredGoogleAuth,
  saveGoogleSession,
  saveStoredGoogleAuth,
} from "@/lib/auth-session";
import {
  createEmptyGitHubHistory,
  getEmptySnapshot,
  getGitHubGrowthSeries,
  getStarredGitHubRepos,
  mergeGitHubHistory,
  pruneGitHubLineGrowthHistory,
  summarizeGitHubLineGrowth,
  summarizeGitHubMetrics,
  summarizeSnapshots,
  shouldRefreshGitHubLineGrowth,
} from "@/lib/dashboard";
import { fetchPropertyRealtimeSnapshot } from "@/lib/ga4";
import { clearGitHubHistory, loadGitHubHistory, saveGitHubHistory } from "@/lib/github-history";
import { aggregateWeeklyContributions } from "@/lib/github";
import { createPageSpeedPlaceholderRow, mergePageSpeedReportRow } from "@/lib/pagespeed";
import type {
  DashboardProperty,
  GitHubRepo,
  GitHubMetricsRequest,
  GitHubMetricsResponse,
  GitHubHistoryStore,
  GitHubSessionResponse,
  GitHubSummary,
  GitHubTimeseriesPoint,
  PageSpeedBulkResponse,
  PageSpeedMonitoredSite,
  PropertyRealtimeSnapshot,
} from "@/lib/types";

const GOOGLE_ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const GOOGLE_SCOPE = `${GOOGLE_ANALYTICS_SCOPE} https://www.googleapis.com/auth/userinfo.email`;
const GOOGLE_POLL_INTERVAL_MS = 30_000;
const GITHUB_METRICS_TIMEOUT_MS = 30_000;
const GITHUB_AUTH_MESSAGE_TYPE = "gadash:github-auth";
const PAGE_SPEED_BULK_CONCURRENCY = 3;

type GoogleAuthState =
  | "checking"
  | "ready"
  | "signed_out"
  | "authorizing"
  | "loading"
  | "loaded";
type GitHubAuthState = "signed_out" | "authorizing" | "loading" | "loaded";

type GitHubAuthMessage = {
  type?: string;
  success?: boolean;
  error?: string;
};

function formatCount(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US").format(value);
}

function formatSignedCount(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    signDisplay: "exceptZero",
  }).format(value);
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

function formatDate(value: string | null): string {
  if (!value) {
    return "No history yet";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatStatusLabel(status: PropertyRealtimeSnapshot["status"]): string {
  return status.replace("_", " ");
}

function isAuthorizedOrigin(allowedOrigins: string[]): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  if (allowedOrigins.length === 0) {
    return true;
  }

  return allowedOrigins.includes(window.location.origin);
}

function getGoogleConfigError(): string | null {
  if (getGoogleClientId().length === 0) {
    return "Set NEXT_PUBLIC_GOOGLE_CLIENT_ID before using the Google Analytics section.";
  }

  if (!isAuthorizedOrigin(getGoogleAuthorizedOrigins())) {
    return `This origin is not allowed for Google OAuth: ${window.location.origin}`;
  }

  return null;
}

function getGitHubConfigError(): string | null {
  if (getGitHubClientId().length === 0) {
    return "Set NEXT_PUBLIC_GITHUB_CLIENT_ID before using the GitHub section.";
  }

  if (!isAuthorizedOrigin(getGitHubAuthorizedOrigins())) {
    return `This origin is not allowed for GitHub OAuth: ${window.location.origin}`;
  }

  return null;
}

function createLoadingState(properties: DashboardProperty[]): PropertyRealtimeSnapshot[] {
  return properties.map((property) => getEmptySnapshot(property.id, property.label));
}

function limitPoints(points: GitHubTimeseriesPoint[], count: number): GitHubTimeseriesPoint[] {
  return points.slice(Math.max(0, points.length - count));
}

function buildPath(
  points: GitHubTimeseriesPoint[],
  width: number,
  height: number,
  padding: number,
  accessor: "value" | "secondaryValue",
): string {
  const values = points.map((point) => point[accessor] ?? 0);
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const chartHeight = height - padding * 2;
  const chartWidth = width - padding * 2;
  const denominator = maxValue === minValue ? 1 : maxValue - minValue;

  return points
    .map((point, index) => {
      const x = padding + (chartWidth * index) / Math.max(points.length - 1, 1);
      const y =
        padding + chartHeight - (((point[accessor] ?? 0) - minValue) / denominator) * chartHeight;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function TimeSeriesChart({
  title,
  subtitle,
  points,
  emptyMessage,
  formatValue = formatCount,
  variant = "line",
}: {
  title: string;
  subtitle: string;
  points: GitHubTimeseriesPoint[];
  emptyMessage: string;
  formatValue?: (value: number | null) => string;
  variant?: "line" | "bars";
}) {
  const width = 640;
  const height = 220;
  const padding = 18;

  if (points.length === 0) {
    return (
      <article className="chart-card">
        <div className="chart-card__copy">
          <p className="chart-card__label">{title}</p>
          <h3>{subtitle}</h3>
        </div>
        <div className="chart-card__placeholder">
          <span>{emptyMessage}</span>
        </div>
      </article>
    );
  }

  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const values = points.map((point) => point.value);
  const minValue = Math.min(...values, 0);
  const chartHeight = height - padding * 2;
  const chartWidth = width - padding * 2;
  const valueRange = maxValue === minValue ? 1 : maxValue - minValue;

  return (
    <article className="chart-card">
      <div className="chart-card__copy">
        <p className="chart-card__label">{title}</p>
        <h3>{subtitle}</h3>
      </div>
      <svg aria-label={title} className="chart-card__visual" viewBox={`0 0 ${width} ${height}`}>
        <line className="chart-card__axis" x1={padding} x2={padding} y1={padding} y2={height - padding} />
        <line
          className="chart-card__axis"
          x1={padding}
          x2={width - padding}
          y1={height - padding}
          y2={height - padding}
        />
        {variant === "bars"
          ? points.map((point, index) => {
              const barWidth = chartWidth / Math.max(points.length, 1);
              const x = padding + index * barWidth + barWidth * 0.15;
              const normalizedHeight = ((point.value - minValue) / valueRange) * chartHeight;
              const barHeight = Math.max(normalizedHeight, 2);
              const y = height - padding - barHeight;

              return (
                <rect
                  className="chart-card__bar"
                  height={barHeight}
                  key={`${point.date}-${index}`}
                  rx="3"
                  width={Math.max(barWidth * 0.7, 3)}
                  x={x}
                  y={y}
                />
              );
            })
          : null}
        {points.length === 1 && variant !== "bars" ? (
          <line
            className="chart-card__line chart-card__line--flat"
            x1={padding}
            x2={width - padding}
            y1={height / 2}
            y2={height / 2}
          />
        ) : null}
        {points.length > 1 ? (
          <path className="chart-card__line" d={buildPath(points, width, height, padding, "value")} />
        ) : null}
        {points.length === 1 && variant !== "bars" ? (
          <circle
            className="chart-card__point"
            cx={width / 2}
            cy={height / 2}
            r="6"
          />
        ) : null}
        {points.some((point) => typeof point.secondaryValue === "number") ? (
          <path
            className="chart-card__line chart-card__line--secondary"
            d={buildPath(points, width, height, padding, "secondaryValue")}
          />
        ) : null}
      </svg>
      <div className="chart-card__footer">
        <span>{formatDate(points[0]?.date ?? null)}</span>
        <span>Latest {formatValue(points[points.length - 1]?.value ?? null)}</span>
        <span>{formatDate(points[points.length - 1]?.date ?? null)}</span>
      </div>
    </article>
  );
}

function GitHubMark() {
  return (
    <svg
      aria-hidden="true"
      className="github-signin__icon"
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.23c-3.35.73-4.06-1.42-4.06-1.42-.55-1.38-1.33-1.75-1.33-1.75-1.09-.74.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.08 1.83 2.82 1.3 3.51.99.11-.78.42-1.3.76-1.6-2.67-.31-5.47-1.34-5.47-5.97 0-1.32.47-2.39 1.24-3.24-.13-.31-.54-1.56.12-3.25 0 0 1.01-.32 3.3 1.24a11.6 11.6 0 0 1 6.01 0c2.29-1.56 3.29-1.24 3.29-1.24.66 1.69.25 2.94.12 3.25.77.85 1.24 1.92 1.24 3.24 0 4.64-2.81 5.65-5.49 5.96.43.37.82 1.1.82 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}

type DashboardProps = {
  hasDashboardSession?: boolean;
  nonce?: string;
};

export function Dashboard({
  hasDashboardSession = false,
  nonce,
}: DashboardProps) {
  const [googlePhase, setGooglePhase] = useState<"signed_out" | "authorizing" | "loading" | "loaded">(
    "signed_out",
  );
  const [scriptReady, setScriptReady] = useState(false);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [googleExpiresAt, setGoogleExpiresAt] = useState<number | null>(null);
  const [dashboardSessionReady, setDashboardSessionReady] = useState(hasDashboardSession);
  const [properties, setProperties] = useState<DashboardProperty[]>(configuredDashboardProperties);
  const [snapshots, setSnapshots] = useState<PropertyRealtimeSnapshot[]>(
    createLoadingState(configuredDashboardProperties),
  );
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleStale, setGoogleStale] = useState(false);

  const [githubPhase, setGitHubPhase] = useState<GitHubAuthState>("signed_out");
  const [githubConnected, setGitHubConnected] = useState(false);
  const [githubScope, setGitHubScope] = useState("");
  const [githubSummary, setGitHubSummary] = useState<GitHubSummary | null>(null);
  const [githubViewerUrl, setGitHubViewerUrl] = useState<string | null>(null);
  const [githubStarredRepos, setGitHubStarredRepos] = useState<GitHubRepo[]>([]);
  const [githubCommitActivity, setGitHubCommitActivity] = useState<GitHubTimeseriesPoint[]>([]);
  const [githubLineGrowth, setGitHubLineGrowth] = useState<GitHubTimeseriesPoint[]>([]);
  const [githubStarHistory, setGitHubStarHistory] = useState<GitHubTimeseriesPoint[]>([]);
  const [githubFollowerHistory, setGitHubFollowerHistory] = useState<GitHubTimeseriesPoint[]>([]);
  const [githubError, setGitHubError] = useState<string | null>(null);
  const [pageSpeedReport, setPageSpeedReport] = useState<PageSpeedBulkResponse | null>(null);
  const [pageSpeedSites, setPageSpeedSites] = useState<PageSpeedMonitoredSite[]>([]);
  const [pageSpeedLoading, setPageSpeedLoading] = useState(false);
  const [pageSpeedError, setPageSpeedError] = useState<string | null>(null);
  const [pageSpeedRecheckingUrl, setPageSpeedRecheckingUrl] = useState<string | null>(null);

  const tokenClientRef = useRef<GoogleTokenClient | null>(null);
  const googleAccessTokenRef = useRef<string | null>(null);
  const propertiesRef = useRef<DashboardProperty[]>(properties);
  const snapshotsRef = useRef<PropertyRealtimeSnapshot[]>(snapshots);
  const refreshGoogleDataRef = useRef<() => Promise<void>>(async () => undefined);
  const refreshGitHubDataRef = useRef<() => Promise<void>>(async () => undefined);
  const googleRefreshTimerRef = useRef<number | null>(null);
  const githubPopupRef = useRef<Window | null>(null);
  const githubHistoryRef = useRef<GitHubHistoryStore>(createEmptyGitHubHistory(""));
  const dashboardSessionReadyRef = useRef(hasDashboardSession);
  const lastPromptRef = useRef<GoogleTokenRequest["prompt"] | undefined>(undefined);
  const silentRestoreAttemptedRef = useRef(false);
  const pageSpeedRunIdRef = useRef(0);

  const googleConfigError = getGoogleConfigError();
  const githubConfigError = getGitHubConfigError();
  const googleAuthState: GoogleAuthState =
    !scriptReady && !googleConfigError
      ? "checking"
      : googlePhase === "authorizing"
        ? "authorizing"
        : googleAccessToken
          ? googlePhase === "loading"
            ? "loading"
            : "loaded"
          : "signed_out";

  const googleSummary = summarizeSnapshots(snapshots);
  const snapshotByPropertyId = new Map(snapshots.map((entry) => [entry.propertyId, entry]));

  const clearGoogleRefreshTimer = useCallback(() => {
    if (googleRefreshTimerRef.current !== null) {
      window.clearTimeout(googleRefreshTimerRef.current);
      googleRefreshTimerRef.current = null;
    }
  }, []);

  const refreshGoogleData = useCallback(async () => {
    const activeToken = googleAccessTokenRef.current;

    if (!activeToken) {
      return;
    }

    startTransition(() => {
      setGooglePhase("loading");
    });

    const nextSnapshots = await Promise.all(
      propertiesRef.current.map((property) => fetchPropertyRealtimeSnapshot(property, activeToken)),
    );

    if (propertiesRef.current.length === 0) {
      setSnapshots([]);
      setGoogleError("No GA4 properties were discovered for this Google account.");
      setGooglePhase("loaded");
      clearGoogleRefreshTimer();
      return;
    }

    const hasAccessibleProperty = nextSnapshots.some((snapshot) => snapshot.status === "ok");
    const hasBlockingErrors = nextSnapshots.every((snapshot) => snapshot.status !== "ok");

    if (
      !hasAccessibleProperty &&
      hasBlockingErrors &&
      snapshotsRef.current.some((snapshot) => snapshot.fetchedAt)
    ) {
      setGoogleStale(true);
      setGoogleError("Could not refresh live data. Showing the last successful snapshot.");
      clearGoogleRefreshTimer();
      googleRefreshTimerRef.current = window.setTimeout(() => {
        void refreshGoogleDataRef.current();
      }, GOOGLE_POLL_INTERVAL_MS);
      setGooglePhase("loaded");
      return;
    }

    setSnapshots(nextSnapshots);
    setGoogleStale(false);
    setGoogleError(
      nextSnapshots.some((snapshot) => snapshot.status === "error")
        ? "Some properties failed to refresh. Totals only include successful properties."
        : null,
    );
    setGooglePhase("loaded");
    clearGoogleRefreshTimer();
    googleRefreshTimerRef.current = window.setTimeout(() => {
      void refreshGoogleDataRef.current();
    }, GOOGLE_POLL_INTERVAL_MS);
  }, [clearGoogleRefreshTimer]);

  const resetGoogleSignedOutState = useCallback(
    (message: string | null) => {
      clearGoogleRefreshTimer();
      googleAccessTokenRef.current = null;
      dashboardSessionReadyRef.current = false;
      setGoogleAccessToken(null);
      setDashboardSessionReady(false);
      setGoogleExpiresAt(null);
      clearStoredGoogleAuth(window.sessionStorage);
      setProperties(configuredDashboardProperties);
      setSnapshots(createLoadingState(configuredDashboardProperties));
      pageSpeedRunIdRef.current += 1;
      setPageSpeedSites([]);
      setPageSpeedReport(null);
      setPageSpeedError(null);
      setPageSpeedRecheckingUrl(null);
      setPageSpeedLoading(false);
      setGoogleStale(false);
      setGoogleError(message);
      setGooglePhase("signed_out");
    },
    [clearGoogleRefreshTimer],
  );

  const resetGitHubSignedOutState = useCallback(
    async (message: string | null, clearHistory = false) => {
      const login = githubHistoryRef.current.login;

      setGitHubConnected(false);
      setGitHubScope("");
      setGitHubSummary(null);
      setGitHubViewerUrl(null);
      setGitHubStarredRepos([]);
      setGitHubCommitActivity([]);
      setGitHubLineGrowth([]);
      setGitHubStarHistory([]);
      setGitHubFollowerHistory([]);
      setGitHubError(message);
      setGitHubPhase("signed_out");
      githubHistoryRef.current = createEmptyGitHubHistory("");

      if (clearHistory && login) {
        await clearGitHubHistory(login);
      }
    },
    [],
  );

  const requestAccessToken = useCallback(
    (prompt: "" | "none" | "consent" | "select_account") => {
      if (!tokenClientRef.current) {
        setGoogleError("Google sign-in is not ready yet.");
        return;
      }

      lastPromptRef.current = prompt;

      if (prompt === "consent" || prompt === "select_account") {
        setGooglePhase("authorizing");
      }

      tokenClientRef.current.requestAccessToken({ prompt });
    },
    [],
  );

  const createDashboardSessionFromGoogleToken = useCallback(async (accessToken: string) => {
    const response = await fetch("/api/auth/google/session", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accessToken }),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      throw new Error(payload?.error ?? `Google dashboard session failed with status ${response.status}.`);
    }

    dashboardSessionReadyRef.current = true;
    setDashboardSessionReady(true);
  }, []);

  const fetchGitHubMetricsRoute = useCallback(
    async (requestBody: GitHubMetricsRequest): Promise<GitHubMetricsResponse> => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => {
        controller.abort();
      }, GITHUB_METRICS_TIMEOUT_MS);

      try {
        const response = await fetch("/api/github/metrics", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as
          | GitHubMetricsResponse
          | { error?: string }
          | null;

        if (!response.ok) {
          throw new Error(
            payload && "error" in payload && typeof payload.error === "string"
              ? payload.error
              : `GitHub data refresh failed with status ${response.status}.`,
          );
        }

        return payload as GitHubMetricsResponse;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new Error("GitHub data refresh timed out. Try Refresh again.");
        }

        throw error;
      } finally {
        window.clearTimeout(timeout);
      }
    },
    [],
  );

  const refreshGitHubData = useCallback(async () => {
    setGitHubPhase("loading");

    try {
      const currentLogin = githubSummary?.login ?? githubHistoryRef.current.login;
      const storedHistory = currentLogin
        ? pruneGitHubLineGrowthHistory(await loadGitHubHistory(currentLogin))
        : createEmptyGitHubHistory("");
      const today = new Date().toISOString().slice(0, 10);
      const staleRepos = storedHistory.repoLineGrowth
        .filter((entry) => shouldRefreshGitHubLineGrowth(entry, today))
        .map((entry) => ({
          id: entry.repoId,
          nameWithOwner: entry.repoName,
        }));
      const metricsRequest =
        currentLogin.length > 0 && storedHistory.repoLineGrowth.length > 0
          ? { staleRepos }
          : {};
      const { fetchedAt, scope, viewer, repos, contributions, repoLineGrowth: refreshedLineGrowth } =
        await fetchGitHubMetricsRoute(metricsRequest);
      const currentRepoIds = new Set(repos.map((repo) => repo.id));
      const history = pruneGitHubLineGrowthHistory(await loadGitHubHistory(viewer.login), currentRepoIds);

      setGitHubConnected(true);
      setGitHubScope(scope);

      const totalStars = repos.reduce((sum, repo) => sum + repo.stargazerCount, 0);
      const commitActivity = aggregateWeeklyContributions(contributions);
      const nextHistory = mergeGitHubHistory(history, {
        fetchedAt,
        followers: viewer.followers,
        totalStars,
        repoNames: repos.map((repo) => repo.nameWithOwner),
        commitActivity,
        repoLineGrowth: refreshedLineGrowth,
      });

      await saveGitHubHistory(nextHistory);

      githubHistoryRef.current = nextHistory;

      setGitHubSummary(
        summarizeGitHubMetrics(nextHistory, {
          login: viewer.login,
          followers: viewer.followers,
          totalStars,
          repoCount: repos.length,
          fetchedAt,
        }),
      );
      setGitHubViewerUrl(viewer.profileUrl);
      setGitHubStarredRepos(getStarredGitHubRepos(repos));
      setGitHubCommitActivity(limitPoints(nextHistory.commitActivity, 26));
      setGitHubLineGrowth(limitPoints(summarizeGitHubLineGrowth(nextHistory.repoLineGrowth).points, 26));
      setGitHubStarHistory(getGitHubGrowthSeries(nextHistory, "totalStars"));
      setGitHubFollowerHistory(getGitHubGrowthSeries(nextHistory, "followers"));
      setGitHubError(null);
      setGitHubPhase("loaded");
    } catch (error) {
      const message = error instanceof Error ? error.message : "GitHub data refresh failed.";

      if (/sign in again/i.test(message) || /401/.test(message)) {
        await resetGitHubSignedOutState(message, false);
        return;
      }

      setGitHubError(message);
      setGitHubPhase("loaded");
    }
  }, [fetchGitHubMetricsRoute, githubSummary?.login, resetGitHubSignedOutState]);

  useEffect(() => {
    const restoredGoogleAuth = loadStoredGoogleAuth(window.sessionStorage);

    if (restoredGoogleAuth) {
      queueMicrotask(() => {
        googleAccessTokenRef.current = restoredGoogleAuth.accessToken;
        setGoogleAccessToken(restoredGoogleAuth.accessToken);
        setGoogleExpiresAt(restoredGoogleAuth.expiresAt);
        setGoogleError(null);
        setGoogleStale(false);
        setGooglePhase("loading");
        if (!dashboardSessionReadyRef.current) {
          void createDashboardSessionFromGoogleToken(restoredGoogleAuth.accessToken).catch((error) => {
            dashboardSessionReadyRef.current = false;
            setDashboardSessionReady(false);
            setGoogleError(error instanceof Error ? error.message : "Google dashboard session failed.");
          });
        }
      });
    }
  }, [createDashboardSessionFromGoogleToken]);

  useEffect(() => {
    dashboardSessionReadyRef.current = dashboardSessionReady;
  }, [dashboardSessionReady]);

  useEffect(() => {
    if (!scriptReady || googleConfigError) {
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
          resetGoogleSignedOutState(
            isSilentRequest ? null : (response.error_description ?? response.error ?? "Google sign-in failed."),
          );
          return;
        }

        saveGoogleSession(window.localStorage);
        const nextExpiresAt = Date.now() + response.expires_in * 1000;

        saveStoredGoogleAuth(window.sessionStorage, {
          accessToken: response.access_token,
          expiresAt: nextExpiresAt,
        });
        setGoogleAccessToken(response.access_token);
        setGoogleExpiresAt(nextExpiresAt);
        setGoogleError(null);
        setGoogleStale(false);
        setGooglePhase("loading");
        void createDashboardSessionFromGoogleToken(response.access_token).catch((error) => {
          dashboardSessionReadyRef.current = false;
          setDashboardSessionReady(false);
          setGoogleError(error instanceof Error ? error.message : "Google dashboard session failed.");
        });
      },
      error_callback: (error) => {
        const isSilentRequest = lastPromptRef.current === "none";

        clearSavedGoogleSession(window.localStorage);
        resetGoogleSignedOutState(isSilentRequest ? null : `Google sign-in failed: ${error.type}`);
      },
    });

    if (loadStoredGoogleAuth(window.sessionStorage)) {
      return;
    }

    if (!silentRestoreAttemptedRef.current && hasSavedGoogleSession(window.localStorage)) {
      silentRestoreAttemptedRef.current = true;
      queueMicrotask(() => {
        requestAccessToken("none");
      });
    }
  }, [
    createDashboardSessionFromGoogleToken,
    googleConfigError,
    requestAccessToken,
    resetGoogleSignedOutState,
    scriptReady,
  ]);

  useEffect(() => {
    function handleGitHubMessage(event: MessageEvent<GitHubAuthMessage>) {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.data?.type !== GITHUB_AUTH_MESSAGE_TYPE) {
        return;
      }

      githubPopupRef.current?.close();
      githubPopupRef.current = null;

      if (!event.data.success) {
        setGitHubError(event.data.error ?? "GitHub sign-in failed.");
        setGitHubPhase("signed_out");
        return;
      }

      setGitHubConnected(true);
      setGitHubError(null);
      setGitHubPhase("loading");
      void refreshGitHubDataRef.current();
    }

    window.addEventListener("message", handleGitHubMessage);

    return () => window.removeEventListener("message", handleGitHubMessage);
  }, []);

  useEffect(() => {
    googleAccessTokenRef.current = googleAccessToken;
  }, [googleAccessToken]);

  useEffect(() => {
    propertiesRef.current = properties;
  }, [properties]);

  useEffect(() => {
    snapshotsRef.current = snapshots;
  }, [snapshots]);

  useEffect(() => {
    refreshGoogleDataRef.current = refreshGoogleData;
  }, [refreshGoogleData]);

  useEffect(() => {
    refreshGitHubDataRef.current = refreshGitHubData;
  }, [refreshGitHubData]);

  useEffect(() => {
    if (!googleAccessToken) {
      clearGoogleRefreshTimer();
      return;
    }

    queueMicrotask(async () => {
      try {
        const discoveredProperties = await discoverDashboardProperties(googleAccessToken);

        if (googleAccessTokenRef.current !== googleAccessToken) {
          return;
        }

        if (discoveredProperties.length === 0) {
          pageSpeedRunIdRef.current += 1;
          setProperties([]);
          setSnapshots([]);
          setPageSpeedSites([]);
          setPageSpeedReport(null);
          setPageSpeedError(null);
          setGoogleError("No GA4 properties were discovered for this Google account.");
          setGoogleStale(false);
          setGooglePhase("loaded");
          return;
        }

        propertiesRef.current = discoveredProperties;
        setProperties(discoveredProperties);
        setSnapshots(createLoadingState(discoveredProperties));
        pageSpeedRunIdRef.current += 1;
        setPageSpeedSites([]);
        setPageSpeedReport(null);
        setPageSpeedError(null);
        setGoogleError(null);
        setGoogleStale(false);

        void discoverPageSpeedSites(discoveredProperties, googleAccessToken)
          .then((discoveredSites) => {
            if (googleAccessTokenRef.current !== googleAccessToken) {
              return;
            }

            setPageSpeedSites(discoveredSites);
          })
          .catch((error) => {
            if (googleAccessTokenRef.current !== googleAccessToken) {
              return;
            }

            setPageSpeedSites([]);
            setPageSpeedError(
              error instanceof Error
                ? `PageSpeed site discovery failed: ${error.message}`
                : "PageSpeed site discovery failed.",
            );
          });

        void refreshGoogleDataRef.current();
      } catch (error) {
        pageSpeedRunIdRef.current += 1;
        setProperties(configuredDashboardProperties);
        setSnapshots(createLoadingState(configuredDashboardProperties));
        setPageSpeedSites([]);
        setPageSpeedReport(null);
        setPageSpeedError(null);
        setGoogleError(
          error instanceof Error
            ? `Property discovery failed: ${error.message}`
            : "Property discovery failed.",
        );
        setGooglePhase("signed_out");
        setGoogleAccessToken(null);
        setGoogleExpiresAt(null);
        clearStoredGoogleAuth(window.sessionStorage);
        clearSavedGoogleSession(window.localStorage);
      }
    });
  }, [clearGoogleRefreshTimer, googleAccessToken]);

  useEffect(() => {
    queueMicrotask(async () => {
      try {
        const response = await fetch("/api/github/session", {
          headers: {
            Accept: "application/json",
          },
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | GitHubSessionResponse
          | { error?: string }
          | null;

        if (response.status === 401) {
          await resetGitHubSignedOutState(null, false);
          return;
        }

        if (!response.ok) {
          throw new Error(
            payload && "error" in payload && typeof payload.error === "string"
              ? payload.error
              : `GitHub session check failed with status ${response.status}.`,
          );
        }

        const session = payload as GitHubSessionResponse;
        setGitHubConnected(session.connected);
        setGitHubScope(session.scope ?? "");

        if (!session.connected) {
          setGitHubPhase("signed_out");
          return;
        }

        setGitHubError(null);
        setGitHubPhase("loading");
        void refreshGitHubDataRef.current();
      } catch (error) {
        setGitHubConnected(false);
        setGitHubScope("");
        setGitHubError(error instanceof Error ? error.message : "GitHub session check failed.");
        setGitHubPhase("signed_out");
      }
    });
  }, [resetGitHubSignedOutState]);

  useEffect(() => {
    if (!googleAccessToken || !googleExpiresAt) {
      return;
    }

    const msUntilRefresh = Math.max(googleExpiresAt - Date.now() - 60_000, 5_000);
    const timer = window.setTimeout(() => {
      requestAccessToken("none");
    }, msUntilRefresh);

    return () => window.clearTimeout(timer);
  }, [googleAccessToken, googleExpiresAt, requestAccessToken]);

  useEffect(() => {
    return () => clearGoogleRefreshTimer();
  }, [clearGoogleRefreshTimer]);

  async function signOutGoogle() {
    clearGoogleRefreshTimer();

    if (googleAccessToken && window.google?.accounts.oauth2) {
      window.google.accounts.oauth2.revoke(googleAccessToken, () => undefined);
    }

    clearStoredGoogleAuth(window.sessionStorage);
    clearSavedGoogleSession(window.localStorage);
    pageSpeedRunIdRef.current += 1;
    setPageSpeedReport(null);
    setPageSpeedError(null);
    setPageSpeedRecheckingUrl(null);
    setPageSpeedLoading(false);

    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });
    } catch {
      // The next navigation re-checks the server session.
    }

    dashboardSessionReadyRef.current = false;
    setDashboardSessionReady(false);
    resetGoogleSignedOutState(null);
  }

  async function signOutGitHub() {
    try {
      await fetch("/api/github/sign-out", {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });
    } catch {
      // The local reset below still clears the dashboard state.
    }

    await resetGitHubSignedOutState(null, true);
  }

  async function fetchPageSpeedReport(url?: string) {
    if (pageSpeedLoading) {
      return;
    }

    if (pageSpeedSites.length === 0) {
      setPageSpeedError("No Google Analytics web stream URLs were discovered.");
      return;
    }

    setPageSpeedLoading(true);
    setPageSpeedError(null);
    setPageSpeedRecheckingUrl(url ?? null);
    const runId = pageSpeedRunIdRef.current + 1;
    pageSpeedRunIdRef.current = runId;

    if (!url) {
      setPageSpeedReport({
        fetchedAt: new Date().toISOString(),
        totalSites: pageSpeedSites.length,
        rows: pageSpeedSites.map((site) => createPageSpeedPlaceholderRow(site)),
      });
    }

    async function fetchSinglePageSpeedReport(siteUrl: string): Promise<PageSpeedBulkResponse> {
      const response = await fetch("/api/pagespeed/bulk", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sites: pageSpeedSites, url: siteUrl }),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | PageSpeedBulkResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        if (response.status === 401) {
          dashboardSessionReadyRef.current = false;
          setDashboardSessionReady(false);
        }

        throw new Error(
          payload && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : `PageSpeed report failed with status ${response.status}.`,
        );
      }

      return payload as PageSpeedBulkResponse;
    }

    try {
      if (url) {
        const nextReport = await fetchSinglePageSpeedReport(url);
        const refreshedRow = nextReport.rows[0];

        if (!refreshedRow || pageSpeedRunIdRef.current !== runId) {
          return;
        }

        startTransition(() => {
          setPageSpeedReport((currentReport) =>
            mergePageSpeedReportRow(currentReport, refreshedRow, pageSpeedSites, nextReport.fetchedAt),
          );
        });
        return;
      }

      let nextSiteIndex = 0;
      let firstErrorMessage: string | null = null;

      async function worker() {
        while (nextSiteIndex < pageSpeedSites.length && pageSpeedRunIdRef.current === runId) {
          const currentSite = pageSpeedSites[nextSiteIndex];
          nextSiteIndex += 1;

          if (!currentSite) {
            continue;
          }

          try {
            const nextReport = await fetchSinglePageSpeedReport(currentSite.url);
            const completedRow = nextReport.rows[0];

            if (!completedRow || pageSpeedRunIdRef.current !== runId) {
              continue;
            }

            startTransition(() => {
              setPageSpeedReport((currentReport) =>
                mergePageSpeedReportRow(currentReport, completedRow, pageSpeedSites, nextReport.fetchedAt),
              );
            });
          } catch (error) {
            if (pageSpeedRunIdRef.current !== runId) {
              continue;
            }

            const message = error instanceof Error ? error.message : "PageSpeed bulk report failed.";

            if (!firstErrorMessage) {
              firstErrorMessage = message;
              setPageSpeedError(message);
            }
          }
        }
      }

      await Promise.all(
        Array.from(
          { length: Math.min(PAGE_SPEED_BULK_CONCURRENCY, pageSpeedSites.length) },
          () => worker(),
        ),
      );
    } catch (error) {
      setPageSpeedError(error instanceof Error ? error.message : "PageSpeed bulk report failed.");
    } finally {
      if (pageSpeedRunIdRef.current === runId) {
        setPageSpeedRecheckingUrl(null);
        setPageSpeedLoading(false);
      }
    }
  }

  async function runPageSpeedReport() {
    await fetchPageSpeedReport();
  }

  async function recheckPageSpeedSite(url: string) {
    await fetchPageSpeedReport(url);
  }

  function startGitHubSignIn() {
    if (githubConfigError) {
      setGitHubError(githubConfigError);
      return;
    }

    const popup = window.open(
      "/api/github/oauth/start",
      "gadash-github-auth",
      "popup=yes,width=620,height=760,resizable=yes,scrollbars=yes",
    );

    if (!popup) {
      setGitHubError("GitHub sign-in popup was blocked by the browser.");
      setGitHubPhase("signed_out");
      return;
    }

    githubPopupRef.current = popup;
    setGitHubError(null);
    setGitHubPhase("authorizing");
  }

  return (
    <>
      <Script
        nonce={nonce}
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => {
          setScriptReady(true);

          if (!window.google?.accounts.oauth2) {
            setGoogleError("Google Identity Services failed to load.");
          }
        }}
      />
      <main className="shell">
        <header className="hero">
          <div className="hero__copy">
            <h1>GADash</h1>
            <p className="hero__lede">Realtime GA4, GitHub trend lines, and bulk PageSpeed checks</p>
          </div>
          <div className="hero__actions auth-toolbar" aria-label="Account connections">
            {googleAccessToken ? (
              <button className="button button--ghost" onClick={() => void signOutGoogle()} type="button">
                Sign out Google
              </button>
            ) : (
              <button
                className="button button--google"
                disabled={
                  googleAuthState === "checking" ||
                  googleAuthState === "authorizing" ||
                  Boolean(googleConfigError)
                }
                onClick={() => requestAccessToken("consent")}
                type="button"
              >
                <span className="google-signin">
                  <span className="google-signin__badge">
                    <GoogleMark />
                  </span>
                  <span className="google-signin__label">
                    {googleAuthState === "authorizing" ? "Authorizing..." : "Sign in with Google"}
                  </span>
                </span>
              </button>
            )}
            {githubConnected ? (
              <button className="button button--ghost" onClick={() => void signOutGitHub()} type="button">
                Sign out GitHub
              </button>
            ) : (
              <button
                className="button button--github"
                disabled={githubPhase === "authorizing" || Boolean(githubConfigError)}
                onClick={startGitHubSignIn}
                type="button"
              >
                <span className="github-signin">
                  <span className="github-signin__badge">
                    <GitHubMark />
                  </span>
                  <span className="github-signin__label">
                    {githubPhase === "authorizing" ? "Authorizing..." : "Sign in with GitHub"}
                  </span>
                </span>
              </button>
            )}
          </div>
        </header>

        <section className="integration">
          <div className="integration__header">
            <div>
              <p className="integration__eyebrow">Google Analytics</p>
              <h2>Realtime active users</h2>
            </div>
            <div className="integration__actions">
              {googleAccessToken ? (
                <button className="button" onClick={() => void refreshGoogleDataRef.current()} type="button">
                  Refresh
                </button>
              ) : null}
            </div>
          </div>

          <section className="status-bar">
            <span className={googleAccessToken ? "status-bar__live-dot" : ""}>
              {googleAccessToken ? "Live" : "Signed out"}
            </span>
            <span>
              {googleAccessToken
                ? googleStale
                  ? "Showing previous snapshot"
                  : `Updated ${formatTimestamp(googleSummary.fetchedAt)}`
                : "Requires Google sign-in for live metrics"}
            </span>
          </section>

          {googleConfigError ? (
            <section className="alert alert--error">
              <h2>Configuration required</h2>
              <p>{googleConfigError}</p>
            </section>
          ) : null}

          {googleError ? (
            <section className="alert alert--warning">
              <h2>{googleSummary.isPartial || googleStale ? "Partial results" : "Sign-in issue"}</h2>
              <p>{googleError}</p>
            </section>
          ) : null}

          {googleAccessToken ? (
            <>
              <section className="summary-grid">
                <article className="summary-card">
                  <p className="summary-card__label">Online now proxy</p>
                  <strong>{formatCount(googleSummary.totalNearNowActiveUsers)}</strong>
                  <span>Active users in the last 0-4 minutes</span>
                </article>
                <article className="summary-card">
                  <p className="summary-card__label">Last 30 minutes</p>
                  <strong>{formatCount(googleSummary.totalLast30MinActiveUsers)}</strong>
                  <span>Steadier executive summary</span>
                </article>
                <article className="summary-card">
                  <p className="summary-card__label">Coverage</p>
                  <strong>
                    {googleSummary.accessibleCount}/{properties.length}
                  </strong>
                  <span>
                    {googleSummary.inaccessibleCount} inaccessible, {googleSummary.errorCount} failed
                  </span>
                </article>
              </section>

              <section className="properties">
                <div className="properties-table" role="region" aria-label="Google Analytics properties">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Status</th>
                        <th scope="col">Property</th>
                        <th scope="col">0-4 min</th>
                        <th scope="col">30 min</th>
                        <th scope="col">Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {properties.map((property) => {
                        const snapshot =
                          snapshotByPropertyId.get(property.id) ?? getEmptySnapshot(property.id, property.label);

                        return (
                          <tr key={property.id}>
                            <td className="properties-table__status">
                              <span className={`pill pill--${snapshot.status}`}>
                                {formatStatusLabel(snapshot.status)}
                              </span>
                            </td>
                            <th className="properties-table__property" scope="row">
                              <span className="properties-table__property-name">{snapshot.label}</span>
                              <span className="properties-table__property-meta">ID {snapshot.propertyId}</span>
                              {snapshot.errorMessage ? (
                                <span className="properties-table__property-error">{snapshot.errorMessage}</span>
                              ) : null}
                            </th>
                            <td className="properties-table__metric">{formatCount(snapshot.nearNowActiveUsers)}</td>
                            <td className="properties-table__metric">{formatCount(snapshot.last30MinActiveUsers)}</td>
                            <td className="properties-table__timestamp">{formatTimestamp(snapshot.fetchedAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <LockedDataRegion provider="Google">
              <section className="summary-grid">
                <article className="summary-card">
                  <p className="summary-card__label">Online now proxy</p>
                  <strong>—</strong>
                  <span>Active users in the last 0-4 minutes</span>
                </article>
                <article className="summary-card">
                  <p className="summary-card__label">Last 30 minutes</p>
                  <strong>—</strong>
                  <span>Steadier executive summary</span>
                </article>
                <article className="summary-card">
                  <p className="summary-card__label">Coverage</p>
                  <strong>—/{properties.length}</strong>
                  <span>Property access checked after sign-in</span>
                </article>
              </section>

              {properties.length > 0 ? (
                <section className="properties">
                  <div className="properties-table" role="region" aria-label="Google Analytics properties">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Status</th>
                          <th scope="col">Property</th>
                          <th scope="col">0-4 min</th>
                          <th scope="col">30 min</th>
                          <th scope="col">Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {properties.map((property) => (
                          <tr key={property.id}>
                            <td className="properties-table__status">
                              <span className="pill pill--locked">Login required</span>
                            </td>
                            <th className="properties-table__property" scope="row">
                              <span className="properties-table__property-name">{property.label}</span>
                              <span className="properties-table__property-meta">ID {property.id}</span>
                            </th>
                            <td className="properties-table__metric">—</td>
                            <td className="properties-table__metric">—</td>
                            <td className="properties-table__timestamp">Not fetched yet</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : (
                <section className="locked-placeholder">
                  Google Analytics property names are discovered after Google sign-in.
                </section>
              )}
            </LockedDataRegion>
          )}
        </section>

        <PageSpeedSection
          configuredSites={pageSpeedSites}
          error={pageSpeedError}
          googleAuthState={googleAuthState}
          googleConfigError={googleConfigError}
          hasGoogleAccessToken={Boolean(googleAccessToken)}
          hasDashboardSession={dashboardSessionReady}
          isLoading={pageSpeedLoading}
          recheckingUrl={pageSpeedRecheckingUrl}
          onRun={() => void runPageSpeedReport()}
          onRecheck={(url) => void recheckPageSpeedSite(url)}
          report={pageSpeedReport}
        />

        <section className="integration integration--github">
          <div className="integration__header">
            <div>
              <p className="integration__eyebrow">GitHub</p>
              <h2>Account activity</h2>
            </div>
            <div className="integration__actions">
              {githubConnected ? (
                <button className="button" onClick={() => void refreshGitHubDataRef.current()} type="button">
                  Refresh
                </button>
              ) : null}
            </div>
          </div>

          <section className="status-bar">
            <span className={githubConnected ? "status-bar__live-dot" : ""}>
              {githubConnected ? (githubPhase === "loading" ? "Refreshing" : "Connected") : "Signed out"}
            </span>
            <span>
              {githubSummary
                ? `Updated ${formatTimestamp(githubSummary.fetchedAt)}`
                : githubScope
                  ? `Scopes ${githubScope}`
                  : "Browser-local history starts on first sign-in"}
            </span>
          </section>

          {githubConfigError ? (
            <section className="alert alert--error">
              <h2>Configuration required</h2>
              <p>{githubConfigError}</p>
            </section>
          ) : null}

          {githubError ? (
            <section className="alert alert--warning">
              <h2>GitHub issue</h2>
              <p>{githubError}</p>
            </section>
          ) : null}

          {githubSummary ? (
            <>
              <section className="summary-grid summary-grid--4">
                <article className="summary-card">
                  <p className="summary-card__label">Repos included</p>
                  <strong>{formatCount(githubSummary.repoCount)}</strong>
                  <span>{githubSummary.login}</span>
                </article>
                <article className="summary-card">
                  <p className="summary-card__label">Stars</p>
                  <strong>{formatCount(githubSummary.totalStars)}</strong>
                  <span>Prospective local trend</span>
                </article>
                <article className="summary-card">
                  <p className="summary-card__label">Followers</p>
                  <strong>{formatCount(githubSummary.followers)}</strong>
                  <span>Tracked from {formatDate(githubSummary.historyStartedAt)}</span>
                </article>
                <article className="summary-card">
                  <p className="summary-card__label">Line-growth coverage</p>
                  <strong>
                    {formatCount(githubSummary.includedRepoCount)}/{formatCount(githubSummary.repoCount)}
                  </strong>
                  <span>
                    {githubSummary.excludedRepoCount} repos skipped
                    {githubViewerUrl ? ` • ${githubViewerUrl}` : ""}
                  </span>
                </article>
              </section>

              {githubSummary.isPartial ? (
                <section className="alert alert--warning">
                  <h2>Partial GitHub line growth</h2>
                  <p>
                    Some repositories did not expose code-frequency statistics. Net line change only includes the
                    repositories GitHub returned stats for.
                  </p>
                </section>
              ) : null}

              <section className="github-repos" aria-label="Starred GitHub repositories">
                <div className="github-repos__header">
                  <div>
                    <p className="chart-card__label">Starred repositories</p>
                    <h3>Repos with stars</h3>
                  </div>
                  <span>{formatCount(githubStarredRepos.length)} starred</span>
                </div>
                {githubStarredRepos.length > 0 ? (
                  <div
                    aria-label="GitHub repositories with stars"
                    className="properties-table github-repos__table"
                    role="region"
                  >
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Repository</th>
                          <th scope="col">Stars</th>
                        </tr>
                      </thead>
                      <tbody>
                        {githubStarredRepos.map((repo) => (
                          <tr key={repo.id}>
                            <th className="properties-table__property" scope="row">
                              <a className="text-link" href={repo.url} rel="noreferrer" target="_blank">
                                {repo.nameWithOwner}
                              </a>
                              <span className="properties-table__property-meta">
                                {repo.isPrivate ? "Private" : "Public"}
                                {repo.pushedAt ? ` • Updated ${formatDate(repo.pushedAt.slice(0, 10))}` : ""}
                              </span>
                            </th>
                            <td className="properties-table__metric">{formatCount(repo.stargazerCount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="github-repos__empty">No repositories with stars were returned for this account.</p>
                )}
              </section>

              <section className="charts-grid">
                <TimeSeriesChart
                  emptyMessage="Commit activity appears after the first successful GitHub sync."
                  points={githubCommitActivity}
                  subtitle="Weekly contribution bars with a 4-week trend line"
                  title="Commit activity"
                  variant="bars"
                />
                <TimeSeriesChart
                  emptyMessage="GitHub has not returned any line-growth stats yet."
                  points={githubLineGrowth}
                  subtitle="Net additions minus deletions across all repos"
                  title="Line growth"
                />
                {githubStarHistory.length > 0 ? (
                  <TimeSeriesChart
                    emptyMessage="Star growth appears after two local GitHub snapshots."
                    formatValue={formatSignedCount}
                    points={githubStarHistory}
                    subtitle="Change in total stars since tracking began"
                    title="Star growth"
                  />
                ) : null}
                {githubFollowerHistory.length > 0 ? (
                  <TimeSeriesChart
                    emptyMessage="Follower growth appears after two local GitHub snapshots."
                    formatValue={formatSignedCount}
                    points={githubFollowerHistory}
                    subtitle="Change in followers since tracking began"
                    title="Follower growth"
                  />
                ) : null}
              </section>
            </>
          ) : githubConnected ? null : (
            <LockedDataRegion provider="GitHub">
              <section className="summary-grid summary-grid--4">
                <article className="summary-card">
                  <p className="summary-card__label">Repos included</p>
                  <strong>—</strong>
                  <span>Repository access checked after sign-in</span>
                </article>
                <article className="summary-card">
                  <p className="summary-card__label">Stars</p>
                  <strong>—</strong>
                  <span>Prospective local trend</span>
                </article>
                <article className="summary-card">
                  <p className="summary-card__label">Followers</p>
                  <strong>—</strong>
                  <span>Tracked after first snapshot</span>
                </article>
                <article className="summary-card">
                  <p className="summary-card__label">Line-growth coverage</p>
                  <strong>—/—</strong>
                  <span>Repository stats checked after sign-in</span>
                </article>
              </section>

              <section className="github-repos">
                <div className="github-repos__header">
                  <div>
                    <p className="chart-card__label">Starred repositories</p>
                    <h3>Repos with stars</h3>
                  </div>
                  <span>Sign in required</span>
                </div>
                <p className="github-repos__empty">Repository star counts appear after GitHub sign-in.</p>
              </section>

              <section className="charts-grid">
                <TimeSeriesChart
                  emptyMessage="Commit activity appears after the first successful GitHub sync."
                  points={[]}
                  subtitle="Weekly contribution bars with a 4-week trend line"
                  title="Commit activity"
                  variant="bars"
                />
                <TimeSeriesChart
                  emptyMessage="GitHub has not returned any line-growth stats yet."
                  points={[]}
                  subtitle="Net additions minus deletions across all repos"
                  title="Line growth"
                />
                <TimeSeriesChart
                  emptyMessage="Star growth appears after two local GitHub snapshots."
                  points={[]}
                  subtitle="Change in total stars since tracking began"
                  title="Star growth"
                />
                <TimeSeriesChart
                  emptyMessage="Follower growth appears after two local GitHub snapshots."
                  points={[]}
                  subtitle="Change in followers since tracking began"
                  title="Follower growth"
                />
              </section>
            </LockedDataRegion>
          )}
        </section>
      </main>
    </>
  );
}
