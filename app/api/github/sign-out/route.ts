import { NextResponse } from "next/server";

import { clearGitHubSessionCookie } from "@/lib/server-auth";

export async function POST() {
  const response = NextResponse.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );

  clearGitHubSessionCookie(response);

  return response;
}
