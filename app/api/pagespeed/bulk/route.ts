import { NextResponse } from "next/server";

import { getConfiguredPageSpeedSites, getPageSpeedApiKey } from "@/lib/pagespeed-config";
import { fetchPageSpeedBulkReport } from "@/lib/pagespeed";

type PageSpeedRequestBody = {
  url?: unknown;
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

async function readRequestedUrl(request: Request): Promise<string | null> {
  const bodyText = await request.text();

  if (bodyText.trim().length === 0) {
    return null;
  }

  let payload: PageSpeedRequestBody;

  try {
    payload = JSON.parse(bodyText) as PageSpeedRequestBody;
  } catch {
    throw new Error("Invalid PageSpeed request payload.");
  }

  if (!payload || typeof payload !== "object" || payload.url === undefined) {
    return null;
  }

  if (typeof payload.url !== "string") {
    throw new Error("PageSpeed request url must be a string.");
  }

  return payload.url.trim();
}

export async function POST(request: Request) {
  const apiKey = getPageSpeedApiKey();

  if (apiKey.length === 0) {
    return jsonResponse({ error: "Missing PAGESPEED_API_KEY server configuration." }, 500);
  }

  try {
    const sites = getConfiguredPageSpeedSites();
    const requestedUrl = await readRequestedUrl(request);
    const requestReferer = new URL("/", request.url).toString();
    const targetSites =
      requestedUrl === null
        ? sites
        : sites.filter((site) => site.url === requestedUrl);

    if (requestedUrl !== null && targetSites.length === 0) {
      return jsonResponse({ error: "Requested PageSpeed site is not in PAGESPEED_MONITORED_URLS." }, 400);
    }

    const report = await fetchPageSpeedBulkReport(targetSites, apiKey, fetch, 2, requestReferer);

    return jsonResponse(report);
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "PageSpeed bulk report failed.",
      },
      500,
    );
  }
}
