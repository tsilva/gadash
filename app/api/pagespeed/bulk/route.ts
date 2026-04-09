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

export async function POST() {
  const apiKey = getPageSpeedApiKey();

  if (apiKey.length === 0) {
    return jsonResponse({ error: "Missing PAGESPEED_API_KEY server configuration." }, 500);
  }

  try {
    const sites = getConfiguredPageSpeedSites();
    const report = await fetchPageSpeedBulkReport(sites, apiKey);

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
