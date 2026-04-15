import { NextResponse } from "next/server";

import {
  fetchGitHubContributionSeries,
  fetchGitHubRepoLineGrowth,
  fetchGitHubRepos,
  fetchGitHubViewer,
} from "@/lib/github-server";
import {
  readDashboardSessionFromRequest,
  readGitHubSessionFromRequest,
} from "@/lib/server-auth";
import type {
  GitHubMetricsRequest,
  GitHubMetricsResponse,
} from "@/lib/types";

type JsonError = { error: string };

function jsonResponse(body: GitHubMetricsResponse | JsonError, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function isStaleRepoList(
  value: unknown,
): value is NonNullable<GitHubMetricsRequest["staleRepos"]> {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        typeof entry.id === "string" &&
        entry.id.trim().length > 0 &&
        typeof entry.nameWithOwner === "string" &&
        entry.nameWithOwner.trim().length > 0,
    )
  );
}

async function readRequestBody(request: Request): Promise<GitHubMetricsRequest> {
  const bodyText = await request.text();

  if (bodyText.trim().length === 0) {
    return {};
  }

  let payload: unknown;

  try {
    payload = JSON.parse(bodyText);
  } catch {
    throw new Error("Invalid GitHub metrics request payload.");
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid GitHub metrics request payload.");
  }

  const candidate = payload as GitHubMetricsRequest;

  if (candidate.staleRepos === undefined) {
    return {};
  }

  if (!isStaleRepoList(candidate.staleRepos)) {
    throw new Error("GitHub metrics staleRepos must be an array of { id, nameWithOwner } objects.");
  }

  return {
    staleRepos: candidate.staleRepos.map((repo) => ({
      id: repo.id.trim(),
      nameWithOwner: repo.nameWithOwner.trim(),
    })),
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker()),
  );

  return results;
}

export async function POST(request: Request) {
  if (!readDashboardSessionFromRequest(request)) {
    return jsonResponse({ error: "Dashboard sign-in required." }, 401);
  }

  const githubSession = readGitHubSessionFromRequest(request);

  if (!githubSession) {
    return jsonResponse({ error: "GitHub sign-in required." }, 401);
  }

  try {
    const requestBody = await readRequestBody(request);
    const fetchedAt = new Date().toISOString();
    const [viewer, repos, contributions] = await Promise.all([
      fetchGitHubViewer(githubSession.accessToken),
      fetchGitHubRepos(githubSession.accessToken),
      fetchGitHubContributionSeries(githubSession.accessToken),
    ]);
    const requestedRepoIds = new Set(requestBody.staleRepos?.map((repo) => repo.id));
    const targetRepos =
      requestBody.staleRepos === undefined
        ? repos
        : repos.filter((repo) => requestedRepoIds.has(repo.id));
    const repoLineGrowth = await mapWithConcurrency(targetRepos, 4, (repo) =>
      fetchGitHubRepoLineGrowth(repo, githubSession.accessToken),
    );

    return jsonResponse({
      scope: githubSession.scope,
      viewer,
      repos,
      contributions,
      repoLineGrowth,
      fetchedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub data refresh failed.";
    const status = /invalid github metrics request payload|stalerepos/i.test(message) ? 400 : 500;

    return jsonResponse({ error: message }, status);
  }
}
