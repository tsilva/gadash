import { NextResponse } from "next/server";

import {
  setDashboardSessionCookie,
  verifyGoogleAccessToken,
  verifyGoogleIdentityCredential,
} from "@/lib/server-auth";

type GoogleSessionRequestBody = {
  accessToken?: unknown;
  credential?: unknown;
};

const GOOGLE_ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

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

  const credential = typeof payload?.credential === "string" ? payload.credential.trim() : "";
  const accessToken = typeof payload?.accessToken === "string" ? payload.accessToken.trim() : "";

  if (!credential && !accessToken) {
    return jsonResponse({ error: "Google sign-in credential or access token is required." }, 400);
  }

  try {
    const session = credential
      ? await verifyGoogleIdentityCredential(credential)
      : await verifyGoogleAccessToken(accessToken, GOOGLE_ANALYTICS_SCOPE);
    const response = jsonResponse({ ok: true, email: session.email });

    setDashboardSessionCookie(response, session.email);

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google sign-in failed.";
    const status = /not allowed/i.test(message) ? 403 : /configuration/i.test(message) ? 500 : 401;

    return jsonResponse({ error: message }, status);
  }
}
