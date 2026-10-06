import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SMOKE_TEST_HEADER = "x-sentry-smoke-token";

function isAuthorized(request: Request): boolean {
  const expectedToken = process.env.SENTRY_SMOKE_TEST_TOKEN?.trim();

  if (!expectedToken) {
    return false;
  }

  return request.headers.get(SMOKE_TEST_HEADER)?.trim() === expectedToken;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!Sentry.isEnabled()) {
    return NextResponse.json({ error: "Sentry is disabled" }, { status: 503 });
  }

  const eventId = Sentry.captureException(new Error("Sentry smoke test"), {
    tags: {
      smoke_test: "true",
    },
  });

  const queueFlushed = await Sentry.flush(2_000);

  // Draining the SDK queue does not prove acceptance or dashboard visibility.
  return NextResponse.json(
    { eventId, queueFlushed },
    { status: queueFlushed ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
