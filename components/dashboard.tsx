"use client";

import Script from "next/script";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";

import { discoverDashboardProperties } from "@/lib/admin";
import {
  configuredDashboardProperties,
  getGitHubAuthorizedOrigins,
  getGitHubClientId,
  getGoogleAuthorizedOrigins,
  getGoogleClientId,
} from "@/lib/config";
import {
  clearStoredGitHubAuth,
  clearStoredGoogleAuth,
  clearSavedGoogleSession,
  hasSavedGoogleSession,
  loadStoredGitHubAuth,
  loadStoredGoogleAuth,
  saveGoogleSession,
  saveStoredGitHubAuth,
  saveStoredGoogleAuth,
} from "@/lib/auth-session";
import {
  createEmptyGitHubHistory,
  getEmptySnapshot,
  getGitHubHistorySeries,
  mergeGitHubHistory,
  summarizeGitHubLineGrowth,
  summarizeGitHubMetrics,
  summarizeSnapshots,
} from "@/lib/dashboard";
import { fetchPropertyRealtimeSnapshot } from "@/lib/ga4";
import { clearGitHubHistory, loadGitHubHistory, saveGitHubHistory } from "@/lib/github-history";
import {
  aggregateWeeklyContributions,
  fetchGitHubContributionSeries,
  fetchGitHubRepoLineGrowth,
  fetchGitHubRepos,
  fetchGitHubViewer,
} from "@/lib/github";
import type {
  DashboardProperty,
  GitHubHistoryStore,
  GitHubSummary,
  GitHubTimeseriesPoint,
  PropertyRealtimeSnapshot,
} from "@/lib/types";

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const GOOGLE_POLL_INTERVAL_MS = 30_000;
const GITHUB_AUTH_MESSAGE_TYPE = "gadash:github-auth";

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
  accessToken?: string;
  scope?: string;
  error?: string;
};

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
  variant = "line",
}: {
  title: string;
  subtitle: string;
  points: GitHubTimeseriesPoint[];
  emptyMessage: string;
  variant?: "line" | "bars";
}) {
  const width = 640;
  const height = 220;
  const padding = 18;

  if (points.length < 2) {
    return (
      <article className="chart-card">
        <div className="chart-card__copy">
          <p className="chart-card__label">{title}</p>
          <h3>{subtitle}</h3>
        </div>
        <p className="chart-card__empty">{emptyMessage}</p>
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
              const barWidth = chartWidth / points.length;
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
        <path className="chart-card__line" d={buildPath(points, width, height, padding, "value")} />
        {points.some((point) => typeof point.secondaryValue === "number") ? (
          <path
            className="chart-card__line chart-card__line--secondary"
            d={buildPath(points, width, height, padding, "secondaryValue")}
          />
        ) : null}
      </svg>
      <div className="chart-card__footer">
        <span>{formatDate(points[0]?.date ?? null)}</span>
        <span>Latest {formatCount(points[points.length - 1]?.value ?? null)}</span>
        <span>{formatDate(points[points.length - 1]?.date ?? null)}</span>
      </div>
    </article>
  );
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

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker()),
  );

  return results;
}

export function Dashboard() {
  const [googlePhase, setGooglePhase] = useState<"signed_out" | "authorizing" | "loading" | "loaded">(
    "signed_out",
  );
  const [scriptReady, setScriptReady] = useState(false);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [googleExpiresAt, setGoogleExpiresAt] = useState<number | null>(null);
  const [properties, setProperties] = useState<DashboardProperty[]>(configuredDashboardProperties);
  const [snapshots, setSnapshots] = useState<PropertyRealtimeSnapshot[]>(
    createLoadingState(configuredDashboardProperties),
  );
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleStale, setGoogleStale] = useState(false);

  const [githubPhase, setGitHubPhase] = useState<GitHubAuthState>("signed_out");
  const [githubAccessToken, setGitHubAccessToken] = useState<string | null>(null);
  const [githubScope, setGitHubScope] = useState("");
  const [githubSummary, setGitHubSummary] = useState<GitHubSummary | null>(null);
  const [githubViewerUrl, setGitHubViewerUrl] = useState<string | null>(null);
  const [githubCommitActivity, setGitHubCommitActivity] = useState<GitHubTimeseriesPoint[]>([]);
  const [githubLineGrowth, setGitHubLineGrowth] = useState<GitHubTimeseriesPoint[]>([]);
  const [githubStarHistory, setGitHubStarHistory] = useState<GitHubTimeseriesPoint[]>([]);
  const [githubFollowerHistory, setGitHubFollowerHistory] = useState<GitHubTimeseriesPoint[]>([]);
  const [githubError, setGitHubError] = useState<string | null>(null);

  const tokenClientRef = useRef<GoogleTokenClient | null>(null);
  const googleAccessTokenRef = useRef<string | null>(null);
  const githubAccessTokenRef = useRef<string | null>(null);
  const propertiesRef = useRef<DashboardProperty[]>(properties);
  const snapshotsRef = useRef<PropertyRealtimeSnapshot[]>(snapshots);
  const refreshGoogleDataRef = useRef<() => Promise<void>>(async () => undefined);
  const refreshGitHubDataRef = useRef<() => Promise<void>>(async () => undefined);
  const googleRefreshTimerRef = useRef<number | null>(null);
  const githubPopupRef = useRef<Window | null>(null);
  const githubHistoryRef = useRef<GitHubHistoryStore>(createEmptyGitHubHistory(""));
  const lastPromptRef = useRef<GoogleTokenRequest["prompt"] | undefined>(undefined);
  const silentRestoreAttemptedRef = useRef(false);

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
      setGoogleAccessToken(null);
      setGoogleExpiresAt(null);
      clearStoredGoogleAuth(window.sessionStorage);
      setProperties(configuredDashboardProperties);
      setSnapshots(createLoadingState(configuredDashboardProperties));
      setGoogleStale(false);
      setGoogleError(message);
      setGooglePhase("signed_out");
    },
    [clearGoogleRefreshTimer],
  );

  const resetGitHubSignedOutState = useCallback(
    async (message: string | null, clearHistory = false) => {
      const login = githubSummary?.login;

      githubAccessTokenRef.current = null;
      setGitHubAccessToken(null);
      setGitHubScope("");
      setGitHubSummary(null);
      setGitHubViewerUrl(null);
      setGitHubCommitActivity([]);
      setGitHubLineGrowth([]);
      setGitHubStarHistory([]);
      setGitHubFollowerHistory([]);
      setGitHubError(message);
      setGitHubPhase("signed_out");
      clearStoredGitHubAuth(window.sessionStorage);

      if (clearHistory && login) {
        await clearGitHubHistory(login);
      }
    },
    [githubSummary?.login],
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

  const refreshGitHubData = useCallback(async () => {
    const activeToken = githubAccessTokenRef.current;

    if (!activeToken) {
      return;
    }

    setGitHubPhase("loading");

    try {
      const fetchedAt = new Date().toISOString();
      const [viewer, repos, contributions] = await Promise.all([
        fetchGitHubViewer(activeToken),
        fetchGitHubRepos(activeToken),
        fetchGitHubContributionSeries(activeToken),
      ]);
      const history = await loadGitHubHistory(viewer.login);
      const today = fetchedAt.slice(0, 10);
      const existingByRepo = new Map(history.repoLineGrowth.map((entry) => [entry.repoId, entry]));
      const staleRepos = repos.filter((repo) => existingByRepo.get(repo.id)?.fetchedOn.slice(0, 10) !== today);
      const refreshedLineGrowth = await mapWithConcurrency(staleRepos, 4, (repo) =>
        fetchGitHubRepoLineGrowth(repo, activeToken),
      );
      const refreshedByRepo = new Map(refreshedLineGrowth.map((entry) => [entry.repoId, entry]));
      const repoLineGrowth = repos.map(
        (repo) =>
          refreshedByRepo.get(repo.id) ??
          existingByRepo.get(repo.id) ?? {
            repoId: repo.id,
            repoName: repo.nameWithOwner,
            fetchedOn: fetchedAt,
            weeks: [],
            status: "error" as const,
            errorMessage: "Repository statistics have not been collected yet.",
          },
      );
      const totalStars = repos.reduce((sum, repo) => sum + repo.stargazerCount, 0);
      const commitActivity = aggregateWeeklyContributions(contributions);
      const nextHistory = mergeGitHubHistory(history, {
        fetchedAt,
        followers: viewer.followers,
        totalStars,
        repoNames: repos.map((repo) => repo.nameWithOwner),
        commitActivity,
        repoLineGrowth,
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
      setGitHubCommitActivity(limitPoints(nextHistory.commitActivity, 26));
      setGitHubLineGrowth(limitPoints(summarizeGitHubLineGrowth(nextHistory.repoLineGrowth).points, 26));
      setGitHubStarHistory(getGitHubHistorySeries(nextHistory, "totalStars"));
      setGitHubFollowerHistory(getGitHubHistorySeries(nextHistory, "followers"));
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
  }, [resetGitHubSignedOutState]);

  useEffect(() => {
    const restoredGoogleAuth = loadStoredGoogleAuth(window.sessionStorage);
    const restoredGitHubAuth = loadStoredGitHubAuth(window.sessionStorage);

    if (restoredGoogleAuth) {
      queueMicrotask(() => {
        googleAccessTokenRef.current = restoredGoogleAuth.accessToken;
        setGoogleAccessToken(restoredGoogleAuth.accessToken);
        setGoogleExpiresAt(restoredGoogleAuth.expiresAt);
        setGoogleError(null);
        setGoogleStale(false);
        setGooglePhase("loading");
      });
    }

    if (restoredGitHubAuth) {
      queueMicrotask(() => {
        githubAccessTokenRef.current = restoredGitHubAuth.accessToken;
        setGitHubAccessToken(restoredGitHubAuth.accessToken);
        setGitHubScope(restoredGitHubAuth.scope);
        setGitHubError(null);
        setGitHubPhase("loading");
      });
    }
  }, []);

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
  }, [googleConfigError, requestAccessToken, resetGoogleSignedOutState, scriptReady]);

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

      if (!event.data.success || !event.data.accessToken) {
        setGitHubError(event.data.error ?? "GitHub sign-in failed.");
        setGitHubPhase("signed_out");
        return;
      }

      githubAccessTokenRef.current = event.data.accessToken;
      setGitHubAccessToken(event.data.accessToken);
      setGitHubScope(event.data.scope ?? "");
      saveStoredGitHubAuth(window.sessionStorage, {
        accessToken: event.data.accessToken,
        scope: event.data.scope ?? "",
      });
      setGitHubError(null);
      setGitHubPhase("loading");
    }

    window.addEventListener("message", handleGitHubMessage);

    return () => window.removeEventListener("message", handleGitHubMessage);
  }, []);

  useEffect(() => {
    googleAccessTokenRef.current = googleAccessToken;
  }, [googleAccessToken]);

  useEffect(() => {
    githubAccessTokenRef.current = githubAccessToken;
  }, [githubAccessToken]);

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

        if (discoveredProperties.length === 0) {
          setProperties([]);
          setSnapshots([]);
          setGoogleError("No GA4 properties were discovered for this Google account.");
          setGoogleStale(false);
          setGooglePhase("loaded");
          return;
        }

        propertiesRef.current = discoveredProperties;
        setProperties(discoveredProperties);
        setSnapshots(createLoadingState(discoveredProperties));
        setGoogleError(null);
        setGoogleStale(false);
        void refreshGoogleDataRef.current();
      } catch (error) {
        setProperties(configuredDashboardProperties);
        setSnapshots(createLoadingState(configuredDashboardProperties));
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
    if (!githubAccessToken) {
      return;
    }

    queueMicrotask(() => {
      void refreshGitHubDataRef.current();
    });
  }, [githubAccessToken]);

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

  function signOutGoogle() {
    clearGoogleRefreshTimer();

    if (googleAccessToken && window.google?.accounts.oauth2) {
      window.google.accounts.oauth2.revoke(googleAccessToken, () => undefined);
    }

    clearStoredGoogleAuth(window.sessionStorage);
    clearSavedGoogleSession(window.localStorage);
    resetGoogleSignedOutState(null);
  }

  async function signOutGitHub() {
    await resetGitHubSignedOutState(null, true);
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
            <p className="hero__lede">Realtime GA4 plus GitHub account trend lines</p>
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
                <>
                  <button className="button" onClick={() => void refreshGoogleDataRef.current()} type="button">
                    Refresh
                  </button>
                  <button className="button button--ghost" onClick={signOutGoogle} type="button">
                    Sign out
                  </button>
                </>
              ) : (
                <button
                  className="button button--google"
                  disabled={googleAuthState === "authorizing" || Boolean(googleConfigError)}
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
            </div>
          </div>

          <section className="status-bar">
            <span className={googleAccessToken ? "status-bar__live-dot" : ""}>
              {googleAccessToken ? "Live" : "Signed out"}
            </span>
            <span>
              {googleStale ? "Showing previous snapshot" : `Updated ${formatTimestamp(googleSummary.fetchedAt)}`}
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
          ) : null}
        </section>

        <section className="integration integration--github">
          <div className="integration__header">
            <div>
              <p className="integration__eyebrow">GitHub</p>
              <h2>Account activity</h2>
            </div>
            <div className="integration__actions">
              {githubAccessToken ? (
                <>
                  <button className="button" onClick={() => void refreshGitHubDataRef.current()} type="button">
                    Refresh
                  </button>
                  <button className="button button--ghost" onClick={() => void signOutGitHub()} type="button">
                    Sign out
                  </button>
                </>
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
          </div>

          <section className="status-bar">
            <span className={githubAccessToken ? "status-bar__live-dot" : ""}>
              {githubAccessToken ? (githubPhase === "loading" ? "Refreshing" : "Connected") : "Signed out"}
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
                <TimeSeriesChart
                  emptyMessage="Stars trend fills in over time from this browser profile onward."
                  points={githubStarHistory}
                  subtitle="Daily total stars captured locally"
                  title="Stars"
                />
                <TimeSeriesChart
                  emptyMessage="Follower growth begins on the first local snapshot."
                  points={githubFollowerHistory}
                  subtitle="Daily follower counts captured locally"
                  title="Followers"
                />
              </section>
            </>
          ) : null}
        </section>
      </main>
    </>
  );
}
