# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # ESLint
npm test             # Run all tests (Node test runner + tsx)
```

Run a single test file:
```bash
node --import tsx --test tests/config.test.ts
```

## Architecture

GADash is a **client-side-only** Next.js (App Router) dashboard that displays GA4 realtime active user counts. There is no backend — the browser authenticates with Google OAuth and calls GA4 APIs directly.

### Data Flow

1. **Auth** — Google Identity Services OAuth 2.0 (`analytics.readonly` scope), token auto-refreshes 1 min before expiry
2. **Property Discovery** — `lib/admin.ts` calls the GA4 Admin API to list all properties the signed-in user can access, with fallback to `NEXT_PUBLIC_GA_PROPERTIES_JSON`
3. **Realtime Polling** — `lib/ga4.ts` fetches two metrics per property every 30s: near-now (0–4 min) and 30-min active users
4. **Aggregation** — `lib/dashboard.ts` summarizes snapshots across properties (totals, coverage, partial flags)
5. **Rendering** — `components/dashboard.tsx` ("use client") manages all state via React hooks and renders property cards

### Key Files

| File | Role |
|------|------|
| `lib/types.ts` | Shared type definitions |
| `lib/config.ts` | Env var parsing, property validation |
| `lib/admin.ts` | GA4 Admin API (property discovery) |
| `lib/ga4.ts` | GA4 Data API (realtime metrics) |
| `lib/dashboard.ts` | Snapshot aggregation |
| `components/dashboard.tsx` | Main UI component (auth + data + render) |
| `google-identity.d.ts` | TypeScript defs for Google Identity Services |

### Environment Variables (all `NEXT_PUBLIC_`)

- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — OAuth client ID (required)
- `NEXT_PUBLIC_GOOGLE_AUTHORIZED_ORIGINS` — comma-separated allowed origins (required)
- `NEXT_PUBLIC_GA_PROPERTIES_JSON` — fallback property list as JSON array (optional)

## Conventions

- **Testing**: Node built-in test runner with `assert/strict` — no Jest/Vitest. Tests are pure-function tests in `tests/`.
- **Styling**: Plain CSS with CSS variables in `globals.css` — no CSS framework.
- **Path aliases**: `@/*` maps to project root.
- **README.md** must be kept up to date with any significant project changes.

## Secrets

Use the human Infisical CLI login and fixed development project in `.infisical.json`. Default dev fetches only the application allowlist. Production is isolated in `gadash-production`, Production `/`, synced to Vercel Production; redeploy after changes. Never print credentials, add plaintext dotenv exports, or broaden access. Preserve original Keychain accounts until migration and rotation are verified. Run `pnpm test:secrets` alongside app checks after changing secret handling.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
