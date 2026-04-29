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
  assert.doesNotMatch(markup, /Bulk site checks/);
  assert.doesNotMatch(markup, /alpha\.example/);
  assert.match(markup, /Sign in with Google/);
});

test("HomePageView renders PageSpeed run controls when the Google dashboard session exists", () => {
  const markup = renderToStaticMarkup(
    createElement(HomePageView, {
      hasDashboardSession: true,
      nonce: "test-nonce",
    }),
  );

  assert.match(markup, /Realtime active users/);
  assert.match(markup, /No Google Analytics web stream URLs were discovered/);
  assert.match(markup, /Run PageSpeed bulk report/);
});
