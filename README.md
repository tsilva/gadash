# GADash

Next.js dashboard for GA4 Realtime data, GitHub account trends, and on-demand bulk PageSpeed checks. Google Analytics data stays client-side; GitHub metrics use a server-side OAuth token exchange route; PageSpeed bulk runs use a server-side API route so the PSI API key stays private.

The app keeps the live Google and GitHub access tokens only in `sessionStorage`, so reloading the same tab stays signed in until the token expires or the tab is closed. Google also keeps a local session marker for best-effort silent restore on trusted browsers. On shared devices, use the in-app `Sign out` button before closing the tab.

## Setup

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env.local`.
3. Create a Google OAuth client of type `Web application`.
4. Enable both the Google Analytics Data API and the Google Analytics Admin API for that Google Cloud project.
5. Add `http://localhost:3000` and your production domain to the OAuth client's Authorized JavaScript origins.
6. Create a GitHub OAuth App if you want GitHub charts:
   - Authorization callback URL: `http://localhost:3000/api/github/oauth/callback` for local development
   - Add your production callback URL as well
7. Fill in:
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
   - `NEXT_PUBLIC_GOOGLE_AUTHORIZED_ORIGINS`
   - `NEXT_PUBLIC_SITE_URL` with the canonical app origin used for metadata and social tags
   - `NEXT_PUBLIC_GITHUB_CLIENT_ID`
   - `NEXT_PUBLIC_GITHUB_AUTHORIZED_ORIGINS`
   - `GITHUB_CLIENT_SECRET`
   - `NEXT_PUBLIC_SENTRY_DSN` to enable browser-side Sentry reporting
   - `SENTRY_DSN` if you want a separate DSN for route handlers and other server-side errors
   - `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, and optional `SENTRY_BASE_URL` if your production builds should upload source maps
   - `SENTRY_SMOKE_TEST_TOKEN` if you want to use the protected `/api/sentry/smoke` route for deployment smoke tests
   - `NEXT_PUBLIC_GA_PROPERTIES_JSON` only if you want a fallback list when Admin API discovery is unavailable
   - `PAGESPEED_API_KEY` for the server-side PageSpeed Insights API route
   - `PAGESPEED_MONITORED_URLS` as a comma-separated or newline-separated list of absolute `https://` site URLs to check in bulk

Optional fallback properties JSON:

```json
[
  { "id": "123456789", "label": "Main Site", "sortOrder": 1 },
  { "id": "987654321", "label": "Docs", "sortOrder": 2 }
]
```

Example `PAGESPEED_MONITORED_URLS` value:

```text
https://example.com,
https://docs.example.com/guides
https://status.example.com/
```

## Run

```bash
pnpm install
pnpm dev
```

## Deploy

- Host the app on Vercel.
- Add `PAGESPEED_API_KEY` and `PAGESPEED_MONITORED_URLS` in Vercel if you want the manual bulk PageSpeed section to work.
- Add the Sentry env vars in Vercel if you want production error ingestion and source map uploads.
- Source map uploads require `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` in the hosted build environment.
- Put Cloudflare in front as DNS/CDN only.
- Add the production origin to both `NEXT_PUBLIC_GOOGLE_AUTHORIZED_ORIGINS` and the Google OAuth client.
- Add the production origin to `NEXT_PUBLIC_GITHUB_AUTHORIZED_ORIGINS` and the GitHub OAuth App settings.
- Vercel preview URLs are intentionally not part of v1 unless you explicitly register them with Google.
- Keep the app's security headers intact in production. Edge/CDN rules must not weaken the shipped `Content-Security-Policy`, framing protections, or related browser hardening headers.
- The app sends baseline security headers itself, including CSP, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, and a restrictive `Permissions-Policy`.
- Silent restore is intended only for trusted browser profiles where re-opening the dashboard should reuse an active Google session without another consent prompt.
- Once `SENTRY_SMOKE_TEST_TOKEN` is set, you can verify live server-side ingestion with:

```bash
curl -H "x-sentry-smoke-token: $SENTRY_SMOKE_TEST_TOKEN" https://your-domain.example/api/sentry/smoke
```

## PageSpeed Notes

- The PageSpeed section is manual-only in v1. Click `Run PageSpeed bulk report` in the dashboard to read the configured site list from env and fetch fresh PSI results.
- Results are held in memory for the current page session only. There is no history, persistence, CSV export, or scheduled run yet.
- Each row links to the external `pagespeed.web.dev` report for the audited site.

## GitHub Metrics Notes

- GitHub sign-in uses a Vercel/Next route handler for the OAuth code exchange because GitHub does not expose a browser-safe token exchange endpoint.
- GitHub trend history is stored in browser-local IndexedDB and is not synced across devices.
- Stars and followers charts are prospective only. They begin from the first successful local snapshot in that browser profile.
- Net line growth is based on GitHub repository statistics (`additions + deletions`) and is not an exact total lines-of-code chart.
- Private repository metrics require the GitHub `repo` scope. If you do not want that, leave the GitHub section unsigned in or remove the GitHub env vars.
