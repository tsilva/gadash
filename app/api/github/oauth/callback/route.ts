import { NextResponse } from "next/server";

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

function renderPopupResult(payload: Record<string, string | boolean>, origin: string): string {
  const serializedPayload = JSON.stringify(payload).replace(/</g, "\\u003c");
  const serializedOrigin = JSON.stringify(origin);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>GitHub Sign-In</title>
  </head>
  <body>
    <p>You can close this window.</p>
    <script>
      const payload = ${serializedPayload};
      const origin = ${serializedOrigin};
      if (window.opener) {
        window.opener.postMessage(payload, origin);
      }
      window.close();
    </script>
  </body>
</html>`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${STATE_COOKIE_NAME}=`))
    ?.slice(`${STATE_COOKIE_NAME}=`.length);

  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  };

  if (!code || !state || !cookieState || cookieState !== state) {
    return new NextResponse(
      renderPopupResult(
        {
          type: "gadash:github-auth",
          success: false,
          error: "GitHub sign-in could not be verified.",
        },
        origin,
      ),
      { headers },
    );
  }

  const clientId = getGitHubClientId();
  const clientSecret = getGitHubClientSecret();

  if (clientId.length === 0 || clientSecret.length === 0) {
    return new NextResponse(
      renderPopupResult(
        {
          type: "gadash:github-auth",
          success: false,
          error: "GitHub OAuth server configuration is incomplete.",
        },
        origin,
      ),
      { headers },
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
      redirect_uri: `${origin}/api/github/oauth/callback`,
      state,
    }),
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
    return new NextResponse(
      renderPopupResult(
        {
          type: "gadash:github-auth",
          success: false,
          error:
            payload?.error_description ??
            payload?.error ??
            `GitHub token exchange failed with status ${tokenResponse.status}.`,
        },
        origin,
      ),
      { headers },
    );
  }

  const response = new NextResponse(
    renderPopupResult(
      {
        type: "gadash:github-auth",
        success: true,
        accessToken: payload.access_token,
        scope: payload.scope ?? "",
      },
      origin,
    ),
    { headers },
  );

  response.cookies.set(STATE_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
