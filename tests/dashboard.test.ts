import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmptyGitHubHistory,
  getGitHubHistorySeries,
  mergeGitHubHistory,
  summarizeGitHubLineGrowth,
  summarizeGitHubMetrics,
  summarizeSnapshots,
} from "../lib/dashboard.ts";

test("summarizeSnapshots counts only accessible properties in totals", () => {
  const summary = summarizeSnapshots([
    {
      propertyId: "1",
      label: "Site A",
      nearNowActiveUsers: 4,
      last30MinActiveUsers: 11,
      status: "ok",
      fetchedAt: "2026-03-13T10:00:00.000Z",
    },
    {
      propertyId: "2",
      label: "Site B",
      nearNowActiveUsers: null,
      last30MinActiveUsers: null,
      status: "no_access",
      fetchedAt: "2026-03-13T10:00:00.000Z",
    },
    {
      propertyId: "3",
      label: "Site C",
      nearNowActiveUsers: null,
      last30MinActiveUsers: null,
      status: "error",
      fetchedAt: "2026-03-13T10:00:00.000Z",
    },
  ]);

  assert.deepEqual(summary, {
    totalNearNowActiveUsers: 4,
    totalLast30MinActiveUsers: 11,
    accessibleCount: 1,
    inaccessibleCount: 1,
    errorCount: 1,
    fetchedAt: "2026-03-13T10:00:00.000Z",
    isPartial: true,
  });
});

test("mergeGitHubHistory deduplicates same-day snapshots and updates commit activity", () => {
  const initial = createEmptyGitHubHistory("tsilva");
  const first = mergeGitHubHistory(initial, {
    fetchedAt: "2026-03-17T08:00:00.000Z",
    followers: 10,
    totalStars: 25,
    repoNames: ["acme/one", "acme/two"],
    commitActivity: [{ date: "2026-03-10", value: 8, secondaryValue: 7 }],
    repoLineGrowth: [
      {
        repoId: "1",
        repoName: "acme/one",
        fetchedOn: "2026-03-17T08:00:00.000Z",
        weeks: [{ date: "2026-03-10", value: 42 }],
        status: "ok",
      },
    ],
  });
  const second = mergeGitHubHistory(first, {
    fetchedAt: "2026-03-17T18:00:00.000Z",
    followers: 11,
    totalStars: 27,
    repoNames: ["acme/one", "acme/two"],
    commitActivity: [{ date: "2026-03-17", value: 12, secondaryValue: 9 }],
    repoLineGrowth: [
      {
        repoId: "1",
        repoName: "acme/one",
        fetchedOn: "2026-03-17T18:00:00.000Z",
        weeks: [{ date: "2026-03-17", value: 84 }],
        status: "ok",
      },
    ],
  });

  assert.equal(second.snapshots.length, 1);
  assert.equal(second.snapshots[0]?.followers, 11);
  assert.deepEqual(second.commitActivity, [{ date: "2026-03-17", value: 12, secondaryValue: 9 }]);
});

test("summarizeGitHubLineGrowth aggregates successful repos and tracks exclusions", () => {
  const summary = summarizeGitHubLineGrowth([
    {
      repoId: "1",
      repoName: "acme/one",
      fetchedOn: "2026-03-17T08:00:00.000Z",
      weeks: [{ date: "2026-03-10", value: 10 }],
      status: "ok",
    },
    {
      repoId: "2",
      repoName: "acme/two",
      fetchedOn: "2026-03-17T08:00:00.000Z",
      weeks: [{ date: "2026-03-10", value: -3 }],
      status: "ok",
    },
    {
      repoId: "3",
      repoName: "acme/three",
      fetchedOn: "2026-03-17T08:00:00.000Z",
      weeks: [],
      status: "error",
      errorMessage: "No stats.",
    },
  ]);

  assert.deepEqual(summary, {
    points: [{ date: "2026-03-10", value: 7 }],
    includedRepoCount: 2,
    excludedRepoCount: 1,
  });
});

test("summarizeGitHubMetrics and history series reflect stored snapshots", () => {
  const history = mergeGitHubHistory(createEmptyGitHubHistory("tsilva"), {
    fetchedAt: "2026-03-17T08:00:00.000Z",
    followers: 11,
    totalStars: 27,
    repoNames: ["acme/one", "acme/two"],
    commitActivity: [{ date: "2026-03-17", value: 12, secondaryValue: 9 }],
    repoLineGrowth: [],
  });

  assert.deepEqual(getGitHubHistorySeries(history, "followers"), [{ date: "2026-03-17", value: 11 }]);
  assert.deepEqual(
    summarizeGitHubMetrics(history, {
      login: "tsilva",
      followers: 11,
      totalStars: 27,
      repoCount: 2,
      fetchedAt: "2026-03-17T08:00:00.000Z",
    }),
    {
      login: "tsilva",
      repoCount: 2,
      totalStars: 27,
      followers: 11,
      fetchedAt: "2026-03-17T08:00:00.000Z",
      includedRepoCount: 0,
      excludedRepoCount: 0,
      isPartial: false,
      historyStartedAt: "2026-03-17",
    },
  );
});
