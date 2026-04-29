import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PageSpeedSection } from "../components/pagespeed-section.tsx";

const unlockedGoogleProps = {
  googleAuthState: "loaded" as const,
  googleConfigError: null,
  hasGoogleAccessToken: true,
  hasDashboardSession: true,
};

test("PageSpeedSection renders a loading button state", () => {
  const markup = renderToStaticMarkup(
    createElement(PageSpeedSection, {
      configuredSites: [],
      error: null,
      ...unlockedGoogleProps,
      isLoading: true,
      onRun: () => undefined,
      onRecheck: () => undefined,
      recheckingUrl: null,
      report: null,
    }),
  );

  assert.match(markup, /Running\.\.\./);
  assert.match(markup, /No Google Analytics web stream URLs were discovered/);
});

test("PageSpeedSection renders Google Analytics sites before the first report run", () => {
  const markup = renderToStaticMarkup(
    createElement(PageSpeedSection, {
      configuredSites: [{ url: "https://alpha.example/", label: "alpha.example" }],
      error: null,
      ...unlockedGoogleProps,
      isLoading: false,
      onRun: () => undefined,
      onRecheck: () => undefined,
      recheckingUrl: null,
      report: null,
    }),
  );

  assert.match(markup, /Monitoring 1 GA site • Run to fetch metrics/);
  assert.match(markup, /alpha\.example/);
  assert.match(markup, /Not run yet/);
  assert.doesNotMatch(markup, /https:\/\/alpha\.example\//);
  assert.match(markup, /Not run/);
  assert.doesNotMatch(markup, /Open report/);
  assert.doesNotMatch(markup, /Recheck/);
});

test("PageSpeedSection renders section context while locked", () => {
  const markup = renderToStaticMarkup(
    createElement(PageSpeedSection, {
      configuredSites: [{ url: "https://alpha.example/", label: "alpha.example" }],
      error: null,
      googleAuthState: "signed_out",
      googleConfigError: null,
      hasGoogleAccessToken: false,
      hasDashboardSession: false,
      isLoading: false,
      onRun: () => undefined,
      onRecheck: () => undefined,
      recheckingUrl: null,
      report: null,
    }),
  );

  assert.match(markup, /Bulk site checks/);
  assert.match(markup, /Requires signing in with Google/);
  assert.match(markup, /alpha\.example/);
  assert.doesNotMatch(markup, /Run PageSpeed bulk report/);
});

test("PageSpeedSection stays locked when only the server Google session exists", () => {
  const markup = renderToStaticMarkup(
    createElement(PageSpeedSection, {
      configuredSites: [],
      error: null,
      googleAuthState: "signed_out",
      googleConfigError: null,
      hasGoogleAccessToken: false,
      hasDashboardSession: true,
      isLoading: false,
      onRun: () => undefined,
      onRecheck: () => undefined,
      recheckingUrl: null,
      report: null,
    }),
  );

  assert.match(markup, /Bulk site checks/);
  assert.match(markup, /Requires signing in with Google/);
  assert.match(markup, /Requires Google sign-in to discover GA site URLs/);
  assert.doesNotMatch(markup, /Run PageSpeed bulk report/);
});

test("PageSpeedSection renders table rows and error details", () => {
  const markup = renderToStaticMarkup(
    createElement(PageSpeedSection, {
      configuredSites: [{ url: "https://alpha.example/", label: "alpha.example" }],
      error: "Config missing",
      ...unlockedGoogleProps,
      isLoading: false,
      onRun: () => undefined,
      onRecheck: () => undefined,
      recheckingUrl: null,
      report: {
        fetchedAt: "2026-04-09T12:00:00.000Z",
        totalSites: 1,
        rows: [
          {
            url: "https://alpha.example/",
            label: "alpha.example",
            reportUrl: "https://pagespeed.web.dev/analysis?url=https%3A%2F%2Falpha.example%2F&form_factor=mobile",
            checkedAt: "2026-04-09T12:00:00.000Z",
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
  assert.match(markup, /Open report/);
  assert.match(markup, /Recheck/);
  assert.match(markup, /Last checked/);
  assert.match(markup, /properties-table__property-heading--stacked/);
  assert.match(markup, /text-link text-link--subtle/);
  assert.match(markup, /properties-table__metric properties-table__metric--warning/);
  assert.match(markup, /properties-table__metric properties-table__metric--success/);
});
