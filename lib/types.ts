export type DashboardProperty = {
  id: string;
  label: string;
  sortOrder?: number;
};

export type PropertyStatus = "ok" | "no_access" | "error" | "loading";

export type PropertyRealtimeSnapshot = {
  propertyId: string;
  label: string;
  nearNowActiveUsers: number | null;
  last30MinActiveUsers: number | null;
  status: PropertyStatus;
  fetchedAt: string | null;
  errorMessage?: string;
};

export type DashboardSummary = {
  totalNearNowActiveUsers: number;
  totalLast30MinActiveUsers: number;
  accessibleCount: number;
  inaccessibleCount: number;
  errorCount: number;
  fetchedAt: string | null;
  isPartial: boolean;
};

export type GitHubRepo = {
  id: string;
  name: string;
  nameWithOwner: string;
  url: string;
  ownerLogin: string;
  stargazerCount: number;
  isPrivate: boolean;
  pushedAt: string | null;
};

export type GitHubTimeseriesPoint = {
  date: string;
  value: number;
  secondaryValue?: number;
};

export type GitHubSnapshot = {
  date: string;
  fetchedAt: string;
  followers: number;
  totalStars: number;
  repoCount: number;
  repoNames: string[];
};

export type GitHubRepoLineGrowth = {
  repoId: string;
  repoName: string;
  fetchedOn: string;
  weeks: GitHubTimeseriesPoint[];
  status: "ok" | "error";
  errorMessage?: string;
};

export type GitHubHistoryStore = {
  login: string;
  snapshots: GitHubSnapshot[];
  repoLineGrowth: GitHubRepoLineGrowth[];
  commitActivity: GitHubTimeseriesPoint[];
  updatedAt: string;
};

export type GitHubSummary = {
  login: string;
  repoCount: number;
  totalStars: number;
  followers: number;
  fetchedAt: string | null;
  includedRepoCount: number;
  excludedRepoCount: number;
  isPartial: boolean;
  historyStartedAt: string | null;
};

export type PageSpeedMonitoredSite = {
  url: string;
  label: string;
};

export type PageSpeedRowStatus = "ok" | "error";

export type PageSpeedStrategyMetrics = {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  firstContentfulPaint: string | null;
  largestContentfulPaint: string | null;
  totalBlockingTime: string | null;
  cumulativeLayoutShift: string | null;
};

export type PageSpeedBulkRow = {
  url: string;
  label: string;
  reportUrl: string;
  checkedAt: string | null;
  status: PageSpeedRowStatus | null;
  errorMessage?: string;
  mobile: PageSpeedStrategyMetrics;
  desktop: PageSpeedStrategyMetrics;
};

export type PageSpeedBulkResponse = {
  fetchedAt: string;
  totalSites: number;
  rows: PageSpeedBulkRow[];
};
