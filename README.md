<p align="center">
  <img src="logo.png" alt="GADash logo" width="96" height="96" />
</p>

# GADash

![Next.js](https://img.shields.io/badge/Next.js-16.1-black?logo=nextdotjs)
![React](https://img.shields.io/badge/React-19.2-149eca?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-10.27-f69220?logo=pnpm&logoColor=white)
![Sentry](https://img.shields.io/badge/Sentry-ready-362d59?logo=sentry&logoColor=white)

**📊 Private realtime dashboard for sites and code 📊**

[GitHub](https://github.com/tsilva/gadash) · [Local setup](#quick-start) · [Environment](#environment)

## Overview

**The Punchline**  
GADash is a private Next.js dashboard for checking GA4 realtime activity, GitHub account momentum, and PageSpeed health from one screen.

**The Pain**  
GA4, GitHub, and PageSpeed all answer useful operational questions, but each one usually requires a separate tab, login flow, and mental model. Realtime analytics also needs careful token handling when it runs in the browser.

**The Solution**  
GADash opens behind a server-verified Google identity gate, then lets the browser request GA4 Analytics access directly. GitHub OAuth and PageSpeed checks run through server route handlers so private tokens and API keys stay out of browser JavaScript.

**The Result**  
You get a focused personal command center: live active users, property coverage, GitHub stars/followers/contribution trends, repository line-growth snapshots, and manual bulk Lighthouse checks for configured sites.

| Fact | Detail |
| --- | --- |
| Data surfaces | GA4 Realtime, GitHub metrics, PageSpeed Insights |
| GA4 refresh | Polls every 30 seconds after Analytics consent |
| Session model | 24 hour signed dashboard and GitHub cookies |
| Test suite | Node test runner with `tsx`, no Jest or Vitest |

## Features

- **Private Google gate** - verifies a Google identity credential server-side before the dashboard opens.
- **Direct GA4 realtime reads** - discovers GA4 properties with the Admin API, then fetches active-user metrics from the browser with `analytics.readonly`.
- **Partial-result handling** - shows coverage counts and stale snapshot warnings when some properties fail or become inaccessible.
- **Server-held GitHub OAuth** - exchanges GitHub OAuth codes in route handlers and stores the token in an HttpOnly cookie.
- **GitHub trend charts** - tracks followers, stars, weekly contribution volume, and repository line-growth history in local IndexedDB.
- **Manual bulk PageSpeed reports** - checks configured HTTPS URLs across mobile and desktop strategies without exposing the PSI key.
- **Security headers by default** - applies nonce-based CSP, frame blocking, referrer policy, content-type hardening, and permissions policy through `proxy.ts`.
- **Sentry-ready builds** - supports client, server, edge, and source-map upload configuration through `@sentry/nextjs`.

## Quick Start

### Run Locally

This repo enforces pnpm through `preinstall`.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), then sign in with an allowlisted Google account.

### Check The App

```bash
pnpm lint
pnpm test
pnpm build
```

After a successful build, you can run the production server locally:

```bash
pnpm start
```

## Environment

Copy `.env.example` to `.env.local` and fill in only the integrations you plan to use.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Yes | Google OAuth client used by the identity gate and GA4 token flow |
| `NEXT_PUBLIC_GOOGLE_AUTHORIZED_ORIGINS` | Yes | Comma-separated origins allowed to use Google sign-in |
| `NEXT_PUBLIC_SITE_URL` | Recommended | Canonical origin for metadata and social cards |
| `AUTH_SESSION_SECRET` | Production | Long random secret for signed private dashboard and GitHub cookies |
| `ALLOWED_GOOGLE_EMAILS` | Yes | Comma-separated Google account allowlist for dashboard access |
| `NEXT_PUBLIC_GITHUB_CLIENT_ID` | Optional | GitHub OAuth app client ID for the GitHub section |
| `NEXT_PUBLIC_GITHUB_AUTHORIZED_ORIGINS` | Optional | Origins allowed to start the GitHub OAuth flow |
| `GITHUB_CLIENT_SECRET` | Optional | GitHub OAuth app secret, used only by server route handlers |
| `NEXT_PUBLIC_GA_PROPERTIES_JSON` | Optional | Fallback GA4 property list when Admin API discovery is unavailable |
| `PAGESPEED_API_KEY` | Optional | Server-side PageSpeed Insights API key |
| `PAGESPEED_MONITORED_URLS` | Optional | Comma- or newline-separated absolute `https://` URLs to check |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional | Browser-side Sentry reporting |
| `SENTRY_DSN` | Optional | Server-side Sentry DSN override |
| `SENTRY_AUTH_TOKEN` | Optional | Enables Sentry source-map uploads during hosted builds |
| `SENTRY_ORG` / `SENTRY_PROJECT` | Optional | Sentry source-map upload target |
| `SENTRY_BASE_URL` | Optional | Sentry base URL, defaults to `https://sentry.io` |
| `SENTRY_SMOKE_TEST_TOKEN` | Optional | Protects the Sentry smoke-test endpoint |

Example fallback GA4 properties:

```json
[
  { "id": "123456789", "label": "Main Site", "sortOrder": 1 },
  { "id": "987654321", "label": "Docs", "sortOrder": 2 }
]
```

Example PageSpeed URL list:

```text
https://example.com,
https://docs.example.com/guides
https://status.example.com/
```

## Setup Guide

### Google

1. Create a Google OAuth client of type `Web application`.
2. Enable the Google Analytics Data API and Google Analytics Admin API for the same Google Cloud project.
3. Add `http://localhost:3000` and your production origin to the OAuth client's Authorized JavaScript origins.
4. Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_AUTHORIZED_ORIGINS`, and `ALLOWED_GOOGLE_EMAILS`.

The first Google sign-in opens the private dashboard. The GA4 section then requests `analytics.readonly` separately and stores the live Analytics access token only in `sessionStorage`.

### GitHub

1. Create a GitHub OAuth App.
2. Use `http://localhost:3000/api/github/oauth/callback` as the local callback URL.
3. Add the production callback URL to the OAuth App before deploying.
4. Set `NEXT_PUBLIC_GITHUB_CLIENT_ID`, `NEXT_PUBLIC_GITHUB_AUTHORIZED_ORIGINS`, and `GITHUB_CLIENT_SECRET`.

The GitHub OAuth flow requests `read:user repo` so private repositories can be included. Leave the GitHub section unsigned in, or remove the GitHub env vars, if you do not want to grant private repository access.

### PageSpeed

1. Create or reuse a Google API key with access to PageSpeed Insights.
2. Set `PAGESPEED_API_KEY`.
3. Set `PAGESPEED_MONITORED_URLS` to one or more absolute `https://` URLs.

PageSpeed checks are manual. Click `Run PageSpeed bulk report` in the dashboard to fetch fresh results, then use `Recheck` to refresh one row.

### Sentry

Set `NEXT_PUBLIC_SENTRY_DSN` for browser reporting. Add `SENTRY_DSN` only when server-side events should use a different DSN.

Source-map uploads require these variables in the hosted build environment:

```bash
SENTRY_AUTH_TOKEN
SENTRY_ORG
SENTRY_PROJECT
```

When `SENTRY_SMOKE_TEST_TOKEN` is set, verify server-side ingestion with:

```bash
curl -H "x-sentry-smoke-token: $SENTRY_SMOKE_TEST_TOKEN" https://your-domain.example/api/sentry/smoke
```

## Usage

### Google Analytics

- Sign in with the allowlisted Google account to unlock the dashboard.
- Click `Sign in with Google` in the Google Analytics section to grant `analytics.readonly`.
- Use `Refresh` for an immediate GA4 refresh. Automatic polling resumes every 30 seconds.
- Watch coverage to see how many discovered properties are accessible, inaccessible, or failing.

### GitHub Metrics

- Sign in with GitHub after the dashboard is unlocked.
- GADash fetches the viewer profile, owned repositories, contribution history, and code-frequency statistics.
- Stars and follower charts are prospective. They start from the first successful local snapshot in the current browser profile.
- GitHub trend history is stored in browser-local IndexedDB and is not synced across devices.

### PageSpeed Checks

- Configure monitored URLs in `PAGESPEED_MONITORED_URLS`.
- Run the bulk report manually from the dashboard.
- Each row shows mobile and desktop performance, accessibility, best practices, SEO, FCP, LCP, TBT, CLS, and a link to the external `pagespeed.web.dev` report.
- Results stay in memory for the current page session. There is no history, persistence, CSV export, or scheduled run yet.

## Architecture

| Area | Files | Role |
| --- | --- | --- |
| App shell | `app/page.tsx`, `app/layout.tsx`, `app/globals.css` | Server session gate, metadata, and dashboard styling |
| Dashboard UI | `components/dashboard.tsx`, `components/auth-gate.tsx`, `components/pagespeed-section.tsx` | Client state, Google/GitHub sign-in, polling, charts, and PageSpeed table |
| GA4 | `lib/admin.ts`, `lib/ga4.ts`, `lib/dashboard.ts` | Property discovery, realtime metrics, and aggregate summaries |
| Auth | `lib/server-auth.ts`, `lib/auth-session.ts`, `app/api/auth/*` | Signed cookies, Google identity verification, and browser token storage helpers |
| GitHub | `app/api/github/*`, `lib/github-server.ts`, `lib/github-history.ts`, `lib/github.ts` | OAuth code exchange, API proxying, server-held token session, and local history |
| PageSpeed | `app/api/pagespeed/bulk/route.ts`, `lib/pagespeed.ts`, `lib/pagespeed-config.ts` | Server-side PSI calls, URL validation, row refreshes, and report shaping |
| Security | `proxy.ts`, `lib/security-headers.ts` | Per-request CSP nonce and browser hardening headers |
| Observability | `instrumentation.ts`, `instrumentation-client.ts`, `sentry.*.config.ts`, `lib/sentry.ts` | Sentry wiring for client, server, edge, and request errors |
| Tests | `tests/*.test.ts` | Pure Node test coverage for routes, config, summaries, auth, headers, and UI helpers |

## Tech Stack

- [Next.js](https://nextjs.org/) - App Router, route handlers, metadata, fonts, and production builds.
- [React](https://react.dev/) - Client dashboard state, charts, tables, and OAuth interactions.
- [TypeScript](https://www.typescriptlang.org/) - Shared API, dashboard, auth, GitHub, and PageSpeed types.
- [Google Identity Services](https://developers.google.com/identity) - Google sign-in and OAuth token flows.
- [Google Analytics APIs](https://developers.google.com/analytics) - GA4 Admin discovery and realtime Data API metrics.
- [GitHub REST and GraphQL APIs](https://docs.github.com/en/rest) - Repository, profile, contribution, and code-frequency data.
- [PageSpeed Insights API](https://developers.google.com/speed/docs/insights/v5/get-started) - Mobile and desktop Lighthouse category scores and core timings.
- [Sentry for Next.js](https://docs.sentry.io/platforms/javascript/guides/nextjs/) - Error reporting and optional source-map upload.

## Deployment Notes

- Vercel is the intended host for the current setup.
- Add `AUTH_SESSION_SECRET` and `ALLOWED_GOOGLE_EMAILS` in production. Without them, the private dashboard gate cannot open reliably.
- Add the production origin to both the Google OAuth client and `NEXT_PUBLIC_GOOGLE_AUTHORIZED_ORIGINS`.
- Add the production GitHub callback URL and production origin to the GitHub OAuth App and `NEXT_PUBLIC_GITHUB_AUTHORIZED_ORIGINS`.
- Vercel preview URLs are not automatically supported unless you explicitly register them with Google and GitHub.
- Keep the shipped security headers intact. CDN or edge rules should not weaken CSP, frame protections, referrer policy, content-type hardening, or permissions policy.
- Full sign-out clears the private dashboard cookie, the server-held GitHub cookie, and local browser auth state.

## Project Structure

```text
app/                    Next.js routes, metadata, API handlers, and global UI
components/             Dashboard, auth gate, Google mark, and PageSpeed table
lib/                    GA4, GitHub, PageSpeed, auth, Sentry, config, and summaries
tests/                  Node test runner coverage
assets/                 Source brand, favicon, app icon, and social-card assets
public/                 Browser-served app icons
google-identity.d.ts    Google Identity Services browser typings
proxy.ts                Security header middleware
```

## Support

Open an issue or send a PR on [GitHub](https://github.com/tsilva/gadash) if the dashboard needs another data source, a stronger runbook, or a deployment-specific note.
