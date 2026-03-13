import type { DashboardProperty } from "@/lib/types";

const ADMIN_ENDPOINT = "https://analyticsadmin.googleapis.com/v1beta/accountSummaries";

type PropertySummary = {
  property?: string;
  displayName?: string;
};

type AccountSummary = {
  propertySummaries?: PropertySummary[];
};

type AccountSummariesResponse = {
  accountSummaries?: AccountSummary[];
  nextPageToken?: string;
  error?: {
    code?: number;
    message?: string;
  };
};

function extractPropertyId(resourceName: string | undefined): string | null {
  if (!resourceName?.startsWith("properties/")) {
    return null;
  }

  const propertyId = resourceName.slice("properties/".length).trim();

  return propertyId.length > 0 ? propertyId : null;
}

function normalizeDiscoveredProperties(accountSummaries: AccountSummary[]): DashboardProperty[] {
  const deduped = new Map<string, DashboardProperty>();

  for (const accountSummary of accountSummaries) {
    for (const propertySummary of accountSummary.propertySummaries ?? []) {
      const propertyId = extractPropertyId(propertySummary.property);
      const label = propertySummary.displayName?.trim();

      if (!propertyId || !label || deduped.has(propertyId)) {
        continue;
      }

      deduped.set(propertyId, {
        id: propertyId,
        label,
      });
    }
  }

  return [...deduped.values()].sort((left, right) => left.label.localeCompare(right.label));
}

export async function discoverDashboardProperties(accessToken: string): Promise<DashboardProperty[]> {
  const accountSummaries: AccountSummary[] = [];
  let nextPageToken: string | undefined;

  do {
    const url = new URL(ADMIN_ENDPOINT);
    url.searchParams.set("pageSize", "200");

    if (nextPageToken) {
      url.searchParams.set("pageToken", nextPageToken);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const json = (await response.json().catch(() => null)) as AccountSummariesResponse | null;

    if (!response.ok) {
      throw new Error(json?.error?.message ?? "Could not discover GA4 properties.");
    }

    accountSummaries.push(...(json?.accountSummaries ?? []));
    nextPageToken = json?.nextPageToken;
  } while (nextPageToken);

  return normalizeDiscoveredProperties(accountSummaries);
}
