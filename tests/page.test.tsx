import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { HomePageView } from "../app/page.tsx";

test("HomePageView renders the dashboard before any integration sign-in", () => {
  const markup = renderToStaticMarkup(
    createElement(HomePageView, {
      hasDashboardSession: false,
      nonce: "test-nonce",
      configuredPageSpeedSites: [{ url: "https://alpha.example/", label: "alpha.example" }],
    }),
  );

  assert.match(markup, /Realtime active users/);
  assert.match(markup, /alpha\.example/);
  assert.match(markup, /Sign in with Google/);
  assert.match(markup, /nonce="test-nonce"/);
});

test("HomePageView renders PageSpeed run controls when the Google dashboard session exists", () => {
  const markup = renderToStaticMarkup(
    createElement(HomePageView, {
      hasDashboardSession: true,
      nonce: "test-nonce",
      configuredPageSpeedSites: [{ url: "https://alpha.example/", label: "alpha.example" }],
    }),
  );

  assert.match(markup, /Realtime active users/);
  assert.match(markup, /alpha\.example/);
  assert.match(markup, /Run PageSpeed bulk report/);
  assert.match(markup, /nonce="test-nonce"/);
});
