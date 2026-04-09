import assert from "node:assert/strict";
import test from "node:test";

import { parsePageSpeedMonitoredSites } from "../lib/pagespeed-config.ts";

test("parsePageSpeedMonitoredSites parses comma-delimited URLs", () => {
  const parsed = parsePageSpeedMonitoredSites("https://alpha.example, https://beta.example/docs");

  assert.deepEqual(parsed, [
    { url: "https://alpha.example/", label: "alpha.example" },
    { url: "https://beta.example/docs", label: "beta.example" },
  ]);
});

test("parsePageSpeedMonitoredSites parses newline-delimited URLs and dedupes", () => {
  const parsed = parsePageSpeedMonitoredSites(`
    https://alpha.example
    https://beta.example
    https://alpha.example
  `);

  assert.deepEqual(parsed, [
    { url: "https://alpha.example/", label: "alpha.example" },
    { url: "https://beta.example/", label: "beta.example" },
  ]);
});

test("parsePageSpeedMonitoredSites rejects invalid and non-https URLs", () => {
  assert.throws(() => parsePageSpeedMonitoredSites("http://alpha.example, not-a-url"), {
    message:
      "PAGESPEED_MONITORED_URLS contains invalid site URLs: http://alpha.example, not-a-url.",
  });
});

test("parsePageSpeedMonitoredSites throws when the config is empty", () => {
  assert.throws(() => parsePageSpeedMonitoredSites(" \n "), {
    message:
      "PAGESPEED_MONITORED_URLS must contain at least one absolute https:// URL separated by commas or new lines.",
  });
});
