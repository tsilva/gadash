import type {
  GitHubContributionPoint,
  GitHubRepo,
  GitHubRepoLineGrowth,
} from "@/lib/types";

const GITHUB_API_URL = "https://api.github.com";
const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
const CONTRIBUTION_LOOKBACK_DAYS = 182;

type GitHubViewerResponse = {
  login: string;
  followers: number;
  html_url: string;
};

type GitHubRepoResponse = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  owner?: {
    login?: string;
  };
  stargazers_count: number;
  private: boolean;
  pushed_at: string | null;
};

type GitHubContributionResponse = {
  data?: {
    viewer?: {
      login?: string;
      contributionsCollection?: {
        contributionCalendar?: {
          weeks?: Array<{
            contributionDays?: Array<{
              date?: string;
              contributionCount?: number;
            }>;
          }>;
        };
      };
    };
  };
  errors?: Array<{ message?: string }>;
};

type CodeFrequencyResponse = Array<[number, number, number]>;

export type GitHubViewer = {
  login: string;
  followers: number;
  profileUrl: string;
};

export async function githubFetchJson<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${GITHUB_API_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (response.status === 401) {
    throw new Error("GitHub session expired. Sign in again.");
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `GitHub request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

export async function fetchGitHubViewer(accessToken: string): Promise<GitHubViewer> {
  const viewer = await githubFetchJson<GitHubViewerResponse>("/user", accessToken);

  return {
    login: viewer.login,
    followers: viewer.followers,
    profileUrl: viewer.html_url,
  };
}

export async function fetchGitHubRepos(accessToken: string): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = [];

  for (let page = 1; page < 100; page += 1) {
    const pageItems = await githubFetchJson<GitHubRepoResponse[]>(
      `/user/repos?affiliation=owner&sort=updated&per_page=100&page=${page}`,
      accessToken,
    );

    repos.push(
      ...pageItems.map((repo) => ({
        id: String(repo.id),
        name: repo.name,
        nameWithOwner: repo.full_name,
        url: repo.html_url,
        ownerLogin: repo.owner?.login ?? repo.full_name.split("/")[0] ?? "",
        stargazerCount: repo.stargazers_count,
        isPrivate: repo.private,
        pushedAt: repo.pushed_at,
      })),
    );

    if (pageItems.length < 100) {
      break;
    }
  }

  return repos.sort((left, right) => left.nameWithOwner.localeCompare(right.nameWithOwner));
}

export async function fetchGitHubContributionSeries(
  accessToken: string,
  now = new Date(),
): Promise<GitHubContributionPoint[]> {
  const to = now.toISOString();
  const from = new Date(
    now.getTime() - CONTRIBUTION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const response = await fetch(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      query: `
        query ViewerContributions($from: DateTime!, $to: DateTime!) {
          viewer {
            contributionsCollection(from: $from, to: $to) {
              contributionCalendar {
                weeks {
                  contributionDays {
                    date
                    contributionCount
                  }
                }
              }
            }
          }
        }
      `,
      variables: { from, to },
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as GitHubContributionResponse;

  if (!response.ok || payload.errors?.length) {
    throw new Error(
      payload.errors?.[0]?.message ?? `GitHub GraphQL request failed with status ${response.status}.`,
    );
  }

  const days =
    payload.data?.viewer?.contributionsCollection?.contributionCalendar?.weeks?.flatMap(
      (week) =>
        week.contributionDays?.map((day) => ({
          date: day.date ?? "",
          value: day.contributionCount ?? 0,
        })) ?? [],
    ) ?? [];

  return days.filter((day) => day.date.length > 0);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function fetchGitHubRepoLineGrowth(
  repo: Pick<GitHubRepo, "id" | "nameWithOwner">,
  accessToken: string,
): Promise<GitHubRepoLineGrowth> {
  let lastStatus = 0;

  for (const delayMs of [0, 1_500, 3_000]) {
    if (delayMs > 0) {
      await wait(delayMs);
    }

    const response = await fetch(
      `${GITHUB_API_URL}/repos/${repo.nameWithOwner}/stats/code_frequency`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${accessToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      },
    );

    lastStatus = response.status;

    if (response.status === 202) {
      continue;
    }

    if (response.status === 204 || response.status === 422) {
      return {
        repoId: repo.id,
        repoName: repo.nameWithOwner,
        fetchedOn: new Date().toISOString(),
        weeks: [],
        status: "error",
        errorMessage: "GitHub does not expose line-growth statistics for this repository.",
      };
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        repoId: repo.id,
        repoName: repo.nameWithOwner,
        fetchedOn: new Date().toISOString(),
        weeks: [],
        status: "error",
        errorMessage: body || `GitHub stats request failed with status ${response.status}.`,
      };
    }

    const data = (await response.json()) as CodeFrequencyResponse;

    return {
      repoId: repo.id,
      repoName: repo.nameWithOwner,
      fetchedOn: new Date().toISOString(),
      weeks: data.map(([unixWeek, additions, deletions]) => ({
        date: new Date(unixWeek * 1000).toISOString().slice(0, 10),
        value: additions + deletions,
      })),
      status: "ok",
    };
  }

  return {
    repoId: repo.id,
    repoName: repo.nameWithOwner,
    fetchedOn: new Date().toISOString(),
    weeks: [],
    status: "error",
    errorMessage:
      lastStatus === 202
        ? "GitHub is still generating repository statistics. Try again later."
        : `GitHub stats request failed with status ${lastStatus}.`,
  };
}
