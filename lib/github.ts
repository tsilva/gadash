import type { GitHubTimeseriesPoint } from "@/lib/types";

function getWeekStart(dateValue: string): string {
  const date = new Date(`${dateValue}T00:00:00Z`);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

export function aggregateWeeklyContributions(
  contributions: GitHubTimeseriesPoint[],
  movingAverageWindow = 4,
): GitHubTimeseriesPoint[] {
  const weekly = new Map<string, number>();

  for (const point of contributions) {
    const weekStart = getWeekStart(point.date);
    weekly.set(weekStart, (weekly.get(weekStart) ?? 0) + point.value);
  }

  const sorted = [...weekly.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, value]) => ({ date, value }));

  return sorted.map((point, index) => {
    const windowStart = Math.max(0, index - movingAverageWindow + 1);
    const slice = sorted.slice(windowStart, index + 1);
    const average =
      slice.reduce((sum, entry) => sum + entry.value, 0) / Math.max(slice.length, 1);

    return {
      ...point,
      secondaryValue: Number(average.toFixed(2)),
    };
  });
}
