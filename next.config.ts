import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DEV_OUTPUT_DIR || ".next",
  turbopack: {
    root: configDirectory,
  },
};

const sentryBaseUrl =
  process.env.SENTRY_BASE_URL?.trim() || process.env.SENTRY_URL?.trim() || undefined;

const isHostedBuild = process.env.VERCEL === "1" && Boolean(process.env.VERCEL_DEPLOYMENT_ID);

const sentryAuthToken = isHostedBuild ? process.env.SENTRY_AUTH_TOKEN?.trim() : undefined;

export default withSentryConfig(nextConfig, {
  webpack: { disableSentryConfig: !isHostedBuild },
  useRunAfterProductionCompileHook: isHostedBuild ? undefined : false,
  authToken: sentryAuthToken,
  org: process.env.SENTRY_ORG?.trim() || undefined,
  project: process.env.SENTRY_PROJECT?.trim() || undefined,
  sentryUrl: sentryBaseUrl,
  silent: !process.env.CI,
  sourcemaps: {
    disable: !sentryAuthToken,
  },
  widenClientFileUpload: Boolean(sentryAuthToken),
});
