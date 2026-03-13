import type { DashboardProperty, PropertyRealtimeSnapshot } from "@/lib/types";

const REALTIME_ENDPOINT = "https://analyticsdata.googleapis.com/v1beta/properties";

type RealtimeRow = {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
};

type RealtimeResponse = {
  rows?: RealtimeRow[];
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

function getMetricValue(row: RealtimeRow | undefined): number | null {
  const rawValue = row?.metricValues?.[0]?.value;

  if (!rawValue) {
    return null;
  }

  const parsed = Number.parseInt(rawValue, 10);

  return Number.isNaN(parsed) ? null : parsed;
}

function mapGoogleApiError(status: number, body: RealtimeResponse | null): {
  status: PropertyRealtimeSnapshot["status"];
  message: string;
} {
  const apiMessage = body?.error?.message ?? "Unknown Google Analytics error.";

  if (status === 401 || status === 403) {
    return {
      status: "no_access",
      message: apiMessage,
    };
  }

  return {
    status: "error",
    message: apiMessage,
  };
}

async function postRealtimeReport(
  propertyId: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<RealtimeResponse> {
  const response = await fetch(`${REALTIME_ENDPOINT}/${propertyId}:runRealtimeReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await response.json().catch(() => null)) as RealtimeResponse | null;

  if (!response.ok) {
    const mappedError = mapGoogleApiError(response.status, json);
    throw Object.assign(new Error(mappedError.message), { dashboardStatus: mappedError.status });
  }

  return json ?? {};
}

export async function fetchPropertyRealtimeSnapshot(
  property: DashboardProperty,
  accessToken: string,
): Promise<PropertyRealtimeSnapshot> {
  const fetchedAt = new Date().toISOString();

  try {
    const [nearNowResponse, last30Response] = await Promise.all([
      postRealtimeReport(property.id, accessToken, {
        metrics: [{ name: "activeUsers" }],
        minuteRanges: [{ name: "0-4 minutes ago", startMinutesAgo: 4, endMinutesAgo: 0 }],
      }),
      postRealtimeReport(property.id, accessToken, {
        metrics: [{ name: "activeUsers" }],
      }),
    ]);

    return {
      propertyId: property.id,
      label: property.label,
      nearNowActiveUsers: getMetricValue(nearNowResponse.rows?.[0]),
      last30MinActiveUsers: getMetricValue(last30Response.rows?.[0]),
      status: "ok",
      fetchedAt,
    };
  } catch (error) {
    const dashboardStatus =
      error instanceof Error && "dashboardStatus" in error
        ? (error.dashboardStatus as PropertyRealtimeSnapshot["status"])
        : "error";

    return {
      propertyId: property.id,
      label: property.label,
      nearNowActiveUsers: null,
      last30MinActiveUsers: null,
      status: dashboardStatus,
      fetchedAt,
      errorMessage: error instanceof Error ? error.message : "Unknown request failure.",
    };
  }
}
