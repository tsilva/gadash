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
    }),
  );

  assert.match(markup, /Realtime active users/);
  assert.match(markup, /Bulk site checks/);
  assert.match(markup, /Account activity/);
  assert.doesNotMatch(markup, /alpha\.example/);
  assert.match(markup, /Sign in with Google/);
  assert.match(markup, /Sign in with GitHub/);
  assert.match(markup, /Requires signing in with Google/);
  assert.match(markup, /Requires signing in with GitHub/);
});

test("HomePageView keeps PageSpeed locked when only the Google dashboard session exists", () => {
  const markup = renderToStaticMarkup(
    createElement(HomePageView, {
      hasDashboardSession: true,
      nonce: "test-nonce",
    }),
  );

  assert.match(markup, /Realtime active users/);
  assert.match(markup, /Bulk site checks/);
  assert.match(markup, /Requires Google sign-in to discover GA site URLs/);
  assert.match(markup, /Requires signing in with Google/);
  assert.doesNotMatch(markup, /Run PageSpeed bulk report/);
});
