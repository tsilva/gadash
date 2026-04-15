import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { HomePageView } from "../app/page.tsx";

test("HomePageView hides dashboard content and monitored sites when unauthenticated", () => {
  const markup = renderToStaticMarkup(
    createElement(HomePageView, {
      isAuthenticated: false,
      nonce: "test-nonce",
      configuredPageSpeedSites: [{ url: "https://alpha.example/", label: "alpha.example" }],
    }),
  );

  assert.match(markup, /Sign in to open the dashboard/);
  assert.doesNotMatch(markup, /Realtime active users/);
  assert.doesNotMatch(markup, /alpha\.example/);
  assert.match(markup, /nonce="test-nonce"/);
});

test("HomePageView renders the dashboard and configured sites when authenticated", () => {
  const markup = renderToStaticMarkup(
    createElement(HomePageView, {
      isAuthenticated: true,
      nonce: "test-nonce",
      configuredPageSpeedSites: [{ url: "https://alpha.example/", label: "alpha.example" }],
    }),
  );

  assert.match(markup, /Realtime active users/);
  assert.match(markup, /alpha\.example/);
  assert.match(markup, /Run PageSpeed bulk report/);
  assert.match(markup, /nonce="test-nonce"/);
});
