import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

import { getSecurityHeaders } from "@/lib/security-headers";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: getSecurityHeaders(process.env.NODE_ENV === "production"),
      },
    ];
  },
};

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN?.trim();
const sentryBaseUrl =
  process.env.SENTRY_BASE_URL?.trim() || process.env.SENTRY_URL?.trim() || undefined;

export default withSentryConfig(nextConfig, {
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
