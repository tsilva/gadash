import { NextResponse } from "next/server";

import { getPageSpeedApiKey } from "@/lib/pagespeed-config";
import { fetchPageSpeedBulkReport } from "@/lib/pagespeed";
import { readDashboardSessionFromRequest } from "@/lib/server-auth";
import type { PageSpeedMonitoredSite } from "@/lib/types";

type PageSpeedRequestBody = {
  sites?: unknown;
  url?: unknown;
};

const MAX_PAGESPEED_SITES = 50;

class PageSpeedRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function normalizePageSpeedUrl(value: string, fieldName: string): string {
  const candidate = value.trim();

  if (candidate.length === 0) {
    throw new PageSpeedRequestError(`${fieldName} must not be empty.`, 400);
  }

  try {
    const parsed = new URL(candidate);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new PageSpeedRequestError(`${fieldName} must be an absolute http:// or https:// URL.`, 400);
    }

    parsed.hash = "";

    return parsed.toString();
  } catch (error) {
    if (error instanceof PageSpeedRequestError) {
      throw error;
    }

    throw new PageSpeedRequestError(`${fieldName} must be an absolute http:// or https:// URL.`, 400);
  }
}

function readSubmittedSites(value: unknown): PageSpeedMonitoredSite[] {
  if (!Array.isArray(value)) {
    throw new PageSpeedRequestError("PageSpeed sites must be provided from Google Analytics web streams.", 400);
  }

  if (value.length === 0) {
    throw new PageSpeedRequestError("PageSpeed sites must include at least one Google Analytics web stream URL.", 400);
  }

  if (value.length > MAX_PAGESPEED_SITES) {
    throw new PageSpeedRequestError(`PageSpeed bulk checks are limited to ${MAX_PAGESPEED_SITES} sites.`, 400);
  }

  const deduped = new Map<string, PageSpeedMonitoredSite>();

  for (const [index, site] of value.entries()) {
    if (!site || typeof site !== "object") {
      throw new PageSpeedRequestError(`PageSpeed site ${index + 1} must be an object.`, 400);
    }

    const { url, label } = site as { url?: unknown; label?: unknown };

    if (typeof url !== "string") {
      throw new PageSpeedRequestError(`PageSpeed site ${index + 1} url must be a string.`, 400);
    }

    if (label !== undefined && typeof label !== "string") {
      throw new PageSpeedRequestError(`PageSpeed site ${index + 1} label must be a string.`, 400);
    }

    const normalizedUrl = normalizePageSpeedUrl(url, `PageSpeed site ${index + 1} url`);
    const hostname = new URL(normalizedUrl).hostname;

    if (!deduped.has(normalizedUrl)) {
      deduped.set(normalizedUrl, {
        url: normalizedUrl,
        label: label?.trim() || hostname,
      });
    }
  }

  return [...deduped.values()];
}

async function readPageSpeedRequest(request: Request): Promise<{
  requestedUrl: string | null;
  sites: PageSpeedMonitoredSite[];
}> {
  const bodyText = await request.text();

  if (bodyText.trim().length === 0) {
    throw new PageSpeedRequestError("PageSpeed sites must be provided from Google Analytics web streams.", 400);
  }

  let payload: PageSpeedRequestBody;

  try {
    payload = JSON.parse(bodyText) as PageSpeedRequestBody;
  } catch {
    throw new PageSpeedRequestError("Invalid PageSpeed request payload.", 400);
  }

  if (!payload || typeof payload !== "object") {
    throw new PageSpeedRequestError("Invalid PageSpeed request payload.", 400);
  }

  const sites = readSubmittedSites(payload.sites);

  if (payload.url === undefined) {
    return { requestedUrl: null, sites };
  }

  if (typeof payload.url !== "string") {
    throw new PageSpeedRequestError("PageSpeed request url must be a string.", 400);
  }

  return {
    requestedUrl: normalizePageSpeedUrl(payload.url, "PageSpeed request url"),
    sites,
  };
}

export async function POST(request: Request) {
  if (!readDashboardSessionFromRequest(request)) {
    return jsonResponse({ error: "Dashboard sign-in required." }, 401);
  }

  const apiKey = getPageSpeedApiKey();

  if (apiKey.length === 0) {
    return jsonResponse({ error: "Missing PAGESPEED_API_KEY server configuration." }, 500);
  }

  try {
    const { requestedUrl, sites } = await readPageSpeedRequest(request);
    const requestReferer = new URL("/", request.url).toString();
    const targetSites =
      requestedUrl === null
        ? sites
        : sites.filter((site) => site.url === requestedUrl);

    if (requestedUrl !== null && targetSites.length === 0) {
      return jsonResponse({ error: "Requested PageSpeed site is not in the Google Analytics web stream list." }, 400);
    }

    const report = await fetchPageSpeedBulkReport(targetSites, apiKey, fetch, 2, requestReferer);

    return jsonResponse(report);
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "PageSpeed bulk report failed.",
      },
      error instanceof PageSpeedRequestError ? error.status : 500,
    );
  }
}
