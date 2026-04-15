import { NextResponse } from "next/server";

import {
  clearGitHubSessionCookie,
  readDashboardSessionFromRequest,
  setGitHubSessionCookie,
} from "@/lib/server-auth";

const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const STATE_COOKIE_NAME = "gadash.github-oauth-state";

function getGitHubClientId(): string {
  return (
    process.env.GITHUB_CLIENT_ID?.trim() ??
    process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID?.trim() ??
    ""
  );
}

function getGitHubClientSecret(): string {
  return process.env.GITHUB_CLIENT_SECRET?.trim() ?? "";
}

function getPopupUrl(requestUrl: string, success: boolean, error?: string): URL {
  const popupUrl = new URL("/github/auth/popup", requestUrl);

  popupUrl.searchParams.set("success", success ? "1" : "0");

  if (error) {
    popupUrl.searchParams.set("error", error);
  }

  return popupUrl;
}

function clearStateCookie(response: NextResponse): void {
  response.cookies.set(STATE_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

function createPopupRedirectResponse(
  requestUrl: string,
  success: boolean,
  error?: string,
): NextResponse {
  const response = NextResponse.redirect(getPopupUrl(requestUrl, success, error), {
    headers: {
      "Cache-Control": "no-store",
    },
  });

  clearStateCookie(response);

  if (!success) {
    clearGitHubSessionCookie(response);
  }

  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${STATE_COOKIE_NAME}=`))
    ?.slice(`${STATE_COOKIE_NAME}=`.length);

  if (!readDashboardSessionFromRequest(request)) {
    return createPopupRedirectResponse(request.url, false, "Dashboard sign-in expired. Sign in again.");
  }

  if (!code || !state || !cookieState || cookieState !== state) {
    return createPopupRedirectResponse(request.url, false, "GitHub sign-in could not be verified.");
  }

  const clientId = getGitHubClientId();
  const clientSecret = getGitHubClientSecret();

  if (clientId.length === 0 || clientSecret.length === 0) {
    return createPopupRedirectResponse(
      request.url,
      false,
      "GitHub OAuth server configuration is incomplete.",
    );
  }

  const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${url.origin}/api/github/oauth/callback`,
      state,
    }),
    cache: "no-store",
  });

  const payload = (await tokenResponse.json().catch(() => null)) as
    | {
        access_token?: string;
        scope?: string;
        error?: string;
        error_description?: string;
      }
    | null;

  if (!tokenResponse.ok || !payload?.access_token) {
    return createPopupRedirectResponse(
      request.url,
      false,
      payload?.error_description ??
        payload?.error ??
        `GitHub token exchange failed with status ${tokenResponse.status}.`,
    );
  }

  const response = createPopupRedirectResponse(request.url, true);
  setGitHubSessionCookie(response, payload.access_token, payload.scope ?? "");

  return response;
}
