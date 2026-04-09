import type {
  PageSpeedBulkResponse,
  PageSpeedBulkRow,
  PageSpeedMonitoredSite,
  PageSpeedStrategyMetrics,
} from "@/lib/types";

const PAGESPEED_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const CATEGORY_KEYS = ["performance", "accessibility", "best-practices", "seo"] as const;

type PageSpeedApiCategory = {
  score?: number | null;
};

type PageSpeedApiAudit = {
  displayValue?: string | null;
};

type PageSpeedApiResponse = {
  error?: {
    message?: string;
  };
  lighthouseResult?: {
    categories?: Record<string, PageSpeedApiCategory | undefined>;
    audits?: Record<string, PageSpeedApiAudit | undefined>;
    runtimeError?: {
      message?: string;
    };
    runWarnings?: string[];
  };
};

type FetchLike = typeof fetch;

function createEmptyStrategyMetrics(): PageSpeedStrategyMetrics {
  return {
    performance: null,
    accessibility: null,
    bestPractices: null,
    seo: null,
    firstContentfulPaint: null,
    largestContentfulPaint: null,
    totalBlockingTime: null,
    cumulativeLayoutShift: null,
  };
}

function getScore(
  response: PageSpeedApiResponse | null,
  key: (typeof CATEGORY_KEYS)[number],
): number | null {
  const rawScore = response?.lighthouseResult?.categories?.[key]?.score;

  return typeof rawScore === "number" ? Math.round(rawScore * 100) : null;
}

function getAuditDisplayValue(response: PageSpeedApiResponse | null, key: string): string | null {
  return response?.lighthouseResult?.audits?.[key]?.displayValue ?? null;
}

function buildStrategyMetrics(response: PageSpeedApiResponse | null): PageSpeedStrategyMetrics {
  return {
    performance: getScore(response, "performance"),
    accessibility: getScore(response, "accessibility"),
    bestPractices: getScore(response, "best-practices"),
    seo: getScore(response, "seo"),
    firstContentfulPaint: getAuditDisplayValue(response, "first-contentful-paint"),
    largestContentfulPaint: getAuditDisplayValue(response, "largest-contentful-paint"),
    totalBlockingTime: getAuditDisplayValue(response, "total-blocking-time"),
    cumulativeLayoutShift: getAuditDisplayValue(response, "cumulative-layout-shift"),
  };
}

export function buildPageSpeedReportUrl(url: string): string {
  return `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}&form_factor=mobile`;
}

export function createPageSpeedPlaceholderRow(site: PageSpeedMonitoredSite): PageSpeedBulkRow {
  return {
    url: site.url,
    label: site.label,
    reportUrl: buildPageSpeedReportUrl(site.url),
    checkedAt: null,
    status: null,
    errorMessage: undefined,
    mobile: createEmptyStrategyMetrics(),
    desktop: createEmptyStrategyMetrics(),
  };
}

export function mergePageSpeedReportRow(
  report: PageSpeedBulkResponse | null,
  row: PageSpeedBulkRow,
  configuredSites: PageSpeedMonitoredSite[],
  fetchedAt: string,
): PageSpeedBulkResponse {
  const baseRows =
    report?.rows.length && report.rows.length > 0
      ? report.rows
      : configuredSites.map((site) => createPageSpeedPlaceholderRow(site));

  const rowsByUrl = new Map(baseRows.map((currentRow) => [currentRow.url, currentRow]));
  rowsByUrl.set(row.url, row);

  const orderedRows =
    configuredSites.length > 0
      ? configuredSites.map((site) => rowsByUrl.get(site.url) ?? createPageSpeedPlaceholderRow(site))
      : [...rowsByUrl.values()];

  return {
    fetchedAt,
    totalSites: configuredSites.length > 0 ? configuredSites.length : orderedRows.length,
    rows: orderedRows,
  };
}

function buildPageSpeedErrorMessage(status: number, response: PageSpeedApiResponse | null): string {
  return response?.error?.message ?? `PageSpeed request failed with status ${status}.`;
}

async function fetchStrategyMetrics(
  siteUrl: string,
  strategy: "mobile" | "desktop",
  apiKey: string,
  fetchImpl: FetchLike,
  referer?: string,
): Promise<{ metrics: PageSpeedStrategyMetrics; errorMessage: string | null }> {
  const url = new URL(PAGESPEED_ENDPOINT);
  url.searchParams.set("url", siteUrl);
  url.searchParams.set("strategy", strategy);
  url.searchParams.set("key", apiKey);

  for (const category of CATEGORY_KEYS) {
    url.searchParams.append("category", category);
  }

  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      ...(referer ? { Referer: referer } : {}),
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as PageSpeedApiResponse | null;

  if (!response.ok) {
    return {
      metrics: createEmptyStrategyMetrics(),
      errorMessage: buildPageSpeedErrorMessage(response.status, payload),
    };
  }

  const runtimeError = payload?.lighthouseResult?.runtimeError?.message ?? null;
  const runWarnings = payload?.lighthouseResult?.runWarnings?.filter(Boolean).join(" ").trim() ?? "";

  return {
    metrics: buildStrategyMetrics(payload),
    errorMessage: runtimeError ?? (runWarnings.length > 0 ? runWarnings : null),
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker()),
  );

  return results;
}

export async function fetchPageSpeedRow(
  site: PageSpeedMonitoredSite,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
  referer?: string,
  checkedAt = new Date().toISOString(),
): Promise<PageSpeedBulkRow> {
  const mobile = await fetchStrategyMetrics(site.url, "mobile", apiKey, fetchImpl, referer);
  const desktop = await fetchStrategyMetrics(site.url, "desktop", apiKey, fetchImpl, referer);
  const errorMessages = [
    mobile.errorMessage ? `Mobile: ${mobile.errorMessage}` : null,
    desktop.errorMessage ? `Desktop: ${desktop.errorMessage}` : null,
  ].filter(Boolean);

  return {
    url: site.url,
    label: site.label,
    reportUrl: buildPageSpeedReportUrl(site.url),
    checkedAt,
    status: errorMessages.length === 0 ? "ok" : "error",
    errorMessage: errorMessages.join(" ") || undefined,
    mobile: mobile.metrics,
    desktop: desktop.metrics,
  };
}

export async function fetchPageSpeedBulkReport(
  sites: PageSpeedMonitoredSite[],
  apiKey: string,
  fetchImpl: FetchLike = fetch,
  concurrency = 2,
  referer?: string,
): Promise<PageSpeedBulkResponse> {
  const fetchedAt = new Date().toISOString();
  const rows = await mapWithConcurrency(sites, concurrency, (site) =>
    fetchPageSpeedRow(site, apiKey, fetchImpl, referer, fetchedAt),
  );

  return {
    fetchedAt,
    totalSites: sites.length,
    rows,
  };
}
