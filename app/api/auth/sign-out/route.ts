import { NextResponse } from "next/server";

import { clearDashboardSessionCookie } from "@/lib/server-auth";

export async function POST() {
  const response = NextResponse.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );

  clearDashboardSessionCookie(response);

  return response;
}
