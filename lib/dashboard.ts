import type {
  DashboardSummary,
  GitHubHistoryStore,
  GitHubRepoLineGrowth,
  GitHubSnapshot,
  GitHubSummary,
  GitHubTimeseriesPoint,
  PropertyRealtimeSnapshot,
} from "@/lib/types";

export function getEmptySnapshot(
  propertyId: string,
  label: string,
): PropertyRealtimeSnapshot {
  return {
    propertyId,
    label,
    nearNowActiveUsers: null,
    last30MinActiveUsers: null,
    status: "loading",
    fetchedAt: null,
  };
}

export function summarizeSnapshots(
  snapshots: PropertyRealtimeSnapshot[],
  fallbackFetchedAt: string | null = null,
): DashboardSummary {
  const accessible = snapshots.filter((snapshot) => snapshot.status === "ok");
  const inaccessibleCount = snapshots.filter((snapshot) => snapshot.status === "no_access").length;
  const errorCount = snapshots.filter((snapshot) => snapshot.status === "error").length;

  return {
    totalNearNowActiveUsers: accessible.reduce(
      (sum, snapshot) => sum + (snapshot.nearNowActiveUsers ?? 0),
      0,
    ),
    totalLast30MinActiveUsers: accessible.reduce(
      (sum, snapshot) => sum + (snapshot.last30MinActiveUsers ?? 0),
      0,
    ),
    accessibleCount: accessible.length,
    inaccessibleCount,
    errorCount,
    fetchedAt:
      snapshots.find((snapshot) => snapshot.fetchedAt)?.fetchedAt ?? fallbackFetchedAt ?? null,
    isPartial: inaccessibleCount > 0 || errorCount > 0,
  };
}

export function createEmptyGitHubHistory(login: string): GitHubHistoryStore {
  return {
    login,
    snapshots: [],
    repoLineGrowth: [],
    commitActivity: [],
    updatedAt: new Date(0).toISOString(),
  };
}

function dedupeSnapshots(snapshots: GitHubSnapshot[]): GitHubSnapshot[] {
  const byDate = new Map<string, GitHubSnapshot>();

  for (const snapshot of snapshots) {
    const existing = byDate.get(snapshot.date);

    if (!existing || existing.fetchedAt < snapshot.fetchedAt) {
      byDate.set(snapshot.date, snapshot);
    }
  }

  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function dedupeRepoLineGrowth(repoLineGrowth: GitHubRepoLineGrowth[]): GitHubRepoLineGrowth[] {
  const byRepoId = new Map<string, GitHubRepoLineGrowth>();

  for (const snapshot of repoLineGrowth) {
    const existing = byRepoId.get(snapshot.repoId);

    if (!existing || existing.fetchedOn < snapshot.fetchedOn) {
      byRepoId.set(snapshot.repoId, snapshot);
    }
  }

  return [...byRepoId.values()].sort((left, right) => left.repoName.localeCompare(right.repoName));
}

export function mergeGitHubHistory(
  history: GitHubHistoryStore,
  update: {
    fetchedAt: string;
    followers: number;
    totalStars: number;
    repoNames: string[];
    commitActivity: GitHubTimeseriesPoint[];
    repoLineGrowth: GitHubRepoLineGrowth[];
  },
): GitHubHistoryStore {
  const date = update.fetchedAt.slice(0, 10);

  return {
    login: history.login,
    snapshots: dedupeSnapshots([
      ...history.snapshots,
      {
        date,
        fetchedAt: update.fetchedAt,
        followers: update.followers,
        totalStars: update.totalStars,
        repoCount: update.repoNames.length,
        repoNames: [...update.repoNames].sort((left, right) => left.localeCompare(right)),
      },
    ]),
    repoLineGrowth: dedupeRepoLineGrowth([...history.repoLineGrowth, ...update.repoLineGrowth]),
    commitActivity: [...update.commitActivity].sort((left, right) => left.date.localeCompare(right.date)),
    updatedAt: update.fetchedAt,
  };
}

export function getGitHubHistorySeries(
  history: GitHubHistoryStore,
  metric: "followers" | "totalStars",
): GitHubTimeseriesPoint[] {
  return history.snapshots.map((snapshot) => ({
    date: snapshot.date,
    value: snapshot[metric],
  }));
}

export function summarizeGitHubLineGrowth(
  repoLineGrowth: GitHubRepoLineGrowth[],
): {
  points: GitHubTimeseriesPoint[];
  includedRepoCount: number;
  excludedRepoCount: number;
} {
  const weekly = new Map<string, number>();
  let includedRepoCount = 0;
  let excludedRepoCount = 0;

  for (const repo of repoLineGrowth) {
    if (repo.status !== "ok" || repo.weeks.length === 0) {
      excludedRepoCount += 1;
      continue;
    }

    includedRepoCount += 1;

    for (const point of repo.weeks) {
      weekly.set(point.date, (weekly.get(point.date) ?? 0) + point.value);
    }
  }

  return {
    points: [...weekly.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, value]) => ({ date, value })),
    includedRepoCount,
    excludedRepoCount,
  };
}

export function summarizeGitHubMetrics(
  history: GitHubHistoryStore,
  current: {
    login: string;
    followers: number;
    totalStars: number;
    repoCount: number;
    fetchedAt: string;
  },
): GitHubSummary {
  const lineGrowth = summarizeGitHubLineGrowth(history.repoLineGrowth);

  return {
    login: current.login,
    repoCount: current.repoCount,
    totalStars: current.totalStars,
    followers: current.followers,
    fetchedAt: current.fetchedAt,
    includedRepoCount: lineGrowth.includedRepoCount,
    excludedRepoCount: lineGrowth.excludedRepoCount,
    isPartial: lineGrowth.excludedRepoCount > 0,
    historyStartedAt: history.snapshots[0]?.date ?? null,
  };
}
