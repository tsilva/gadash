import assert from "node:assert/strict";
import test from "node:test";

import { fetchPageSpeedBulkReport, mergePageSpeedReportRow } from "../lib/pagespeed.ts";

function buildSuccessResponse(strategy: string) {
  const performanceScore = strategy === "mobile" ? 0.91 : 0.99;

  return new Response(
    JSON.stringify({
      lighthouseResult: {
        categories: {
          performance: { score: performanceScore },
          accessibility: { score: 0.87 },
          "best-practices": { score: 0.93 },
          seo: { score: 0.95 },
        },
        audits: {
          "first-contentful-paint": { displayValue: strategy === "mobile" ? "1.2 s" : "0.7 s" },
          "largest-contentful-paint": { displayValue: strategy === "mobile" ? "2.1 s" : "1.1 s" },
          "total-blocking-time": { displayValue: strategy === "mobile" ? "110 ms" : "0 ms" },
          "cumulative-layout-shift": { displayValue: strategy === "mobile" ? "0.03" : "0.01" },
        },
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

test("fetchPageSpeedBulkReport maps successful strategy results", async () => {
  const report = await fetchPageSpeedBulkReport(
    [{ url: "https://alpha.example/", label: "alpha.example" }],
    "test-key",
    async (input) => {
      const requestUrl = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);

      return buildSuccessResponse(requestUrl.searchParams.get("strategy") ?? "mobile");
    },
  );

  assert.equal(report.totalSites, 1);
  assert.equal(report.rows[0]?.status, "ok");
  assert.equal(
    report.rows[0]?.reportUrl,
    "https://pagespeed.web.dev/analysis?url=https%3A%2F%2Falpha.example%2F&form_factor=mobile",
  );
  assert.equal(report.rows[0]?.checkedAt, report.fetchedAt);
  assert.equal(report.rows[0]?.mobile.performance, 91);
  assert.equal(report.rows[0]?.desktop.performance, 99);
  assert.equal(report.rows[0]?.mobile.firstContentfulPaint, "1.2 s");
  assert.equal(report.rows[0]?.desktop.totalBlockingTime, "0 ms");
});

test("fetchPageSpeedBulkReport preserves partial site failures", async () => {
  const report = await fetchPageSpeedBulkReport(
    [{ url: "https://alpha.example/", label: "alpha.example" }],
    "test-key",
    async (input) => {
      const requestUrl = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const strategy = requestUrl.searchParams.get("strategy");

      if (strategy === "desktop") {
        return new Response(JSON.stringify({ error: { message: "quota exceeded" } }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        });
      }

      return buildSuccessResponse("mobile");
    },
  );

  assert.equal(report.rows[0]?.status, "error");
  assert.match(report.rows[0]?.errorMessage ?? "", /Desktop: quota exceeded/);
  assert.equal(report.rows[0]?.mobile.performance, 91);
  assert.equal(report.rows[0]?.desktop.performance, null);
});

test("fetchPageSpeedBulkReport forwards an optional referer header", async () => {
  const seenReferers: string[] = [];

  await fetchPageSpeedBulkReport(
    [{ url: "https://alpha.example/", label: "alpha.example" }],
    "test-key",
    async (_input, init) => {
      const headers = new Headers(init?.headers);
      seenReferers.push(headers.get("Referer") ?? "");

      return buildSuccessResponse("mobile");
    },
    2,
    "https://gadash.tsilva.eu/",
  );

  assert.deepEqual(seenReferers, ["https://gadash.tsilva.eu/", "https://gadash.tsilva.eu/"]);
});

test("mergePageSpeedReportRow preserves configured order and fills placeholders", () => {
  const merged = mergePageSpeedReportRow(
    null,
    {
      url: "https://beta.example/",
      label: "beta.example",
      reportUrl: "https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fbeta.example%2F&form_factor=mobile",
      checkedAt: "2026-04-09T12:30:00.000Z",
      status: "ok",
      mobile: {
        performance: 99,
        accessibility: 98,
        bestPractices: 97,
        seo: 96,
        firstContentfulPaint: "0.8 s",
        largestContentfulPaint: "1.4 s",
        totalBlockingTime: "20 ms",
        cumulativeLayoutShift: "0.01",
      },
      desktop: {
        performance: 100,
        accessibility: 98,
        bestPractices: 97,
        seo: 96,
        firstContentfulPaint: "0.4 s",
        largestContentfulPaint: "0.9 s",
        totalBlockingTime: "0 ms",
        cumulativeLayoutShift: "0",
      },
    },
    [
      { url: "https://alpha.example/", label: "alpha.example" },
      { url: "https://beta.example/", label: "beta.example" },
    ],
    "2026-04-09T12:30:00.000Z",
  );

  assert.equal(merged.totalSites, 2);
  assert.equal(merged.rows[0]?.url, "https://alpha.example/");
  assert.equal(merged.rows[0]?.status, null);
  assert.equal(merged.rows[0]?.checkedAt, null);
  assert.equal(merged.rows[1]?.url, "https://beta.example/");
  assert.equal(merged.rows[1]?.status, "ok");
  assert.equal(merged.rows[1]?.checkedAt, "2026-04-09T12:30:00.000Z");
});
