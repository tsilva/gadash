import assert from "node:assert/strict";
import test from "node:test";

import { fetchPageSpeedBulkReport } from "../lib/pagespeed.ts";

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
  assert.equal(report.rows[0]?.reportUrl, "https://pagespeed.web.dev/?url=https%3A%2F%2Falpha.example%2F");
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
