import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PageSpeedSection } from "../components/pagespeed-section.tsx";

test("PageSpeedSection renders a loading button state", () => {
  const markup = renderToStaticMarkup(
    createElement(PageSpeedSection, {
      error: null,
      isLoading: true,
      onRun: () => undefined,
      report: null,
    }),
  );

  assert.match(markup, /Running\.\.\./);
  assert.match(markup, /Reads the monitored site list from Vercel env vars on demand/);
});

test("PageSpeedSection renders table rows and error details", () => {
  const markup = renderToStaticMarkup(
    createElement(PageSpeedSection, {
      error: "Config missing",
      isLoading: false,
      onRun: () => undefined,
      report: {
        fetchedAt: "2026-04-09T12:00:00.000Z",
        totalSites: 1,
        rows: [
          {
            url: "https://alpha.example/",
            label: "alpha.example",
            reportUrl: "https://pagespeed.web.dev/?url=https%3A%2F%2Falpha.example%2F",
            status: "error",
            errorMessage: "Desktop: failed",
            mobile: {
              performance: 88,
              accessibility: 91,
              bestPractices: 93,
              seo: 95,
              firstContentfulPaint: "1.2 s",
              largestContentfulPaint: "2.0 s",
              totalBlockingTime: "120 ms",
              cumulativeLayoutShift: "0.04",
            },
            desktop: {
              performance: null,
              accessibility: null,
              bestPractices: null,
              seo: null,
              firstContentfulPaint: null,
              largestContentfulPaint: null,
              totalBlockingTime: null,
              cumulativeLayoutShift: null,
            },
          },
        ],
      },
    }),
  );

  assert.match(markup, /PageSpeed issue/);
  assert.match(markup, /Config missing/);
  assert.match(markup, /alpha\.example/);
  assert.match(markup, /PageSpeed bulk results/);
  assert.match(markup, /Desktop: failed/);
  assert.match(markup, /Open/);
});
