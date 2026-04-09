import { NextResponse } from "next/server";

import { getConfiguredPageSpeedSites, getPageSpeedApiKey } from "@/lib/pagespeed-config";
import { fetchPageSpeedBulkReport } from "@/lib/pagespeed";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const apiKey = getPageSpeedApiKey();

  if (apiKey.length === 0) {
    return jsonResponse({ error: "Missing PAGESPEED_API_KEY server configuration." }, 500);
  }

  try {
    const sites = getConfiguredPageSpeedSites();
    const requestReferer = new URL("/", request.url).toString();
    const report = await fetchPageSpeedBulkReport(sites, apiKey, fetch, 2, requestReferer);

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
