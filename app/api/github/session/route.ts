import { NextResponse } from "next/server";

import {
  readDashboardSessionFromRequest,
  readGitHubSessionFromRequest,
} from "@/lib/server-auth";
import type { GitHubSessionResponse } from "@/lib/types";

function jsonResponse(body: GitHubSessionResponse | { error: string }, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  if (!readDashboardSessionFromRequest(request)) {
    return jsonResponse({ error: "Dashboard sign-in required." }, 401);
  }

  const githubSession = readGitHubSessionFromRequest(request);

  if (!githubSession) {
    return jsonResponse({ connected: false });
  }

  return jsonResponse({
    connected: true,
    scope: githubSession.scope,
  });
}
