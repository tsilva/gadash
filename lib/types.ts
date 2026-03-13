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

