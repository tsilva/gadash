import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { readDashboardSessionFromRequest } from "@/lib/server-auth";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const STATE_COOKIE_NAME = "gadash.github-oauth-state";

function getGitHubClientId(): string {
  return (
    process.env.GITHUB_CLIENT_ID?.trim() ??
    process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID?.trim() ??
    ""
  );
}

export async function GET(request: Request) {
  if (!readDashboardSessionFromRequest(request)) {
    return NextResponse.json({ error: "Dashboard sign-in required." }, { status: 401 });
  }

  const clientId = getGitHubClientId();

  if (clientId.length === 0) {
    return NextResponse.json({ error: "Missing GitHub OAuth client configuration." }, { status: 500 });
  }

  const url = new URL(request.url);
  const origin = url.origin;
  const state = randomUUID();
  const redirectUri = `${origin}/api/github/oauth/callback`;
  const authorizeUrl = new URL(GITHUB_AUTHORIZE_URL);

  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", "read:user repo");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("allow_signup", "false");

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}
