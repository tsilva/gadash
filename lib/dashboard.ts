import type { DashboardSummary, PropertyRealtimeSnapshot } from "@/lib/types";

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

