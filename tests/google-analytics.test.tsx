import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { GoogleAnalyticsTag } from "../components/google-analytics.tsx";
import { getGoogleAnalyticsBootstrap } from "../lib/google-analytics.ts";

const TEST_TAG = "G-TESTONLY";

test("Google Analytics remains unloaded until website tracking consent is granted", () => {
  for (const consent of [undefined, "denied", "invalid"]) {
    assert.equal(getGoogleAnalyticsBootstrap(TEST_TAG, consent), null);
    const markup = renderToStaticMarkup(createElement(GoogleAnalyticsTag, {
      measurementId: TEST_TAG,
      nonce: "test-nonce",
      consent,
    }));
    assert.match(markup, /Allow Google Analytics/);
    assert.doesNotMatch(markup, /<script|googletagmanager\.com|gtag\(/);
  }
});

test("invalid or missing measurement configuration cannot inject tag code", () => {
  for (const id of [undefined, "", "invalid", "G-TEST';alert(1)//"]) {
    assert.equal(getGoogleAnalyticsBootstrap(id, "granted"), null);
    assert.equal(renderToStaticMarkup(createElement(GoogleAnalyticsTag, {
      measurementId: id,
      nonce: "test-nonce",
      consent: "granted",
    })), "");
  }
});

test("bootstrap queues consent before a single automatic pageview configuration", () => {
  const bootstrap = getGoogleAnalyticsBootstrap(` ${TEST_TAG} `, "granted");
  assert.ok(bootstrap);
  const existingEntry = { existing: true };
  const dataLayer: unknown[] = [existingEntry];
  // No Google script is loaded and no network request is sent by this test.
  runInNewContext(bootstrap, { window: { dataLayer } });
  assert.equal(dataLayer[0], existingEntry);
  const commands = dataLayer.slice(1).map((entry) => Array.from(entry as ArrayLike<unknown>));
  assert.deepEqual(commands.map((command) => command.slice(0, 2)), [
    ["consent", "default"],
    ["consent", "update"],
    ["js", commands[2][1]],
    ["config", TEST_TAG],
  ]);
  const defaults = commands[0][2] as Record<string, string>;
  assert.equal(defaults.analytics_storage, "denied");
  assert.equal(defaults.ad_storage, "denied");
  assert.equal(defaults.ad_user_data, "denied");
  assert.equal(defaults.ad_personalization, "denied");
  assert.equal((commands[1][2] as Record<string, string>).analytics_storage, "granted");
  const config = commands[3][2] as Record<string, boolean>;
  assert.equal(config.allow_google_signals, false);
  assert.equal(config.allow_ad_personalization_signals, false);
  assert.notEqual(config.send_page_view, false);
});
