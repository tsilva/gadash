import { NextResponse } from "next/server";

import { setDashboardSessionCookie, verifyGoogleIdentityCredential } from "@/lib/server-auth";

type GoogleSessionRequestBody = {
  credential?: unknown;
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  let payload: GoogleSessionRequestBody;

  try {
    payload = (await request.json()) as GoogleSessionRequestBody;
  } catch {
    return jsonResponse({ error: "Invalid Google sign-in request payload." }, 400);
  }

  if (!payload || typeof payload.credential !== "string" || payload.credential.trim().length === 0) {
    return jsonResponse({ error: "Google sign-in credential is required." }, 400);
  }

  try {
    const session = await verifyGoogleIdentityCredential(payload.credential.trim());
    const response = jsonResponse({ ok: true, email: session.email });

    setDashboardSessionCookie(response, session.email);

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google sign-in failed.";
    const status = /not allowed/i.test(message) ? 403 : /configuration/i.test(message) ? 500 : 401;

    return jsonResponse({ error: message }, status);
  }
}
