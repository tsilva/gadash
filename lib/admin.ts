import type { DashboardProperty, PageSpeedMonitoredSite } from "@/lib/types";

const ADMIN_ENDPOINT = "https://analyticsadmin.googleapis.com/v1beta/accountSummaries";
const DATA_STREAMS_ENDPOINT = "https://analyticsadmin.googleapis.com/v1beta/properties";

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

type DataStream = {
  displayName?: string;
  webStreamData?: {
    defaultUri?: string;
  };
};

type DataStreamsResponse = {
  dataStreams?: DataStream[];
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

function normalizeWebStreamSite(defaultUri: string | undefined, displayName: string | undefined): PageSpeedMonitoredSite | null {
  const candidate = defaultUri?.trim();

  if (!candidate) {
    return null;
  }

  const urlCandidate = /^[a-z][a-z\d+.-]*:\/\//i.test(candidate) ? candidate : `https://${candidate}`;

  try {
    const parsed = new URL(urlCandidate);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }

    parsed.hash = "";

    return {
      url: parsed.toString(),
      label: displayName?.trim() || parsed.hostname,
    };
  } catch {
    return null;
  }
}

async function discoverPropertyWebStreamSites(
  property: DashboardProperty,
  accessToken: string,
): Promise<PageSpeedMonitoredSite[]> {
  const sites: PageSpeedMonitoredSite[] = [];
  let nextPageToken: string | undefined;

  do {
    const url = new URL(`${DATA_STREAMS_ENDPOINT}/${property.id}/dataStreams`);
    url.searchParams.set("pageSize", "200");

    if (nextPageToken) {
      url.searchParams.set("pageToken", nextPageToken);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const json = (await response.json().catch(() => null)) as DataStreamsResponse | null;

    if (!response.ok) {
      throw new Error(json?.error?.message ?? `Could not discover data streams for ${property.label}.`);
    }

    for (const dataStream of json?.dataStreams ?? []) {
      const site = normalizeWebStreamSite(dataStream.webStreamData?.defaultUri, dataStream.displayName);

      if (site) {
        sites.push(site);
      }
    }

    nextPageToken = json?.nextPageToken;
  } while (nextPageToken);

  return sites;
}

export async function discoverPageSpeedSites(
  properties: DashboardProperty[],
  accessToken: string,
): Promise<PageSpeedMonitoredSite[]> {
  const deduped = new Map<string, PageSpeedMonitoredSite>();

  for (const property of properties) {
    const sites = await discoverPropertyWebStreamSites(property, accessToken);

    for (const site of sites) {
      if (!deduped.has(site.url)) {
        deduped.set(site.url, site);
      }
    }
  }

  return [...deduped.values()].sort((left, right) => left.label.localeCompare(right.label));
}
