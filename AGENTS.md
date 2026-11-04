# AGENTS.md

## Archive status

GADash is retired and preserved as a historical reference. Its successor is
[RepoMan](https://github.com/tsilva/repoman). Keep the GitHub repository archived
at the end of any authorized maintenance. Do not resume production deployment,
automated updates, or live telemetry checks as part of source inspection.

## Commands

Use pnpm 10.27.0, as pinned in `package.json`.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev:app --port auto  # start without fetching project credentials
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:secrets         # local mocked credential-launcher tests
```

Use the printed development URL. OAuth sign-in requires independently configured
providers that permit that origin. Do not restart or terminate other servers.

## Architecture

This Next.js App Router application has a client dashboard and server route
handlers. Google Identity Services authenticates the browser for GA4 property
discovery and realtime polling. Server routes validate Google sessions, perform
GitHub OAuth and metrics requests, and run PageSpeed checks. Signed cookies and
an account allowlist protect server-backed actions. GitHub trend history stays
in browser IndexedDB. `proxy.ts` builds nonce-based security headers.

- `components/dashboard.tsx`: dashboard state and rendering.
- `lib/admin.ts`, `lib/ga4.ts`: GA4 property discovery and realtime requests.
- `lib/auth-session.ts`, `lib/server-auth.ts`: dashboard authentication.
- `lib/github-server.ts`, `app/api/github/`: GitHub server integration.
- `lib/pagespeed.ts`, `app/api/pagespeed/`: PageSpeed integration.
- `tests/`: Node test runner tests through `tsx`, using `assert/strict`.

Use plain CSS and the existing `@/*` alias. Update the README and authoritative
reference docs when supported behavior or commands change. Preserve dependency
pins, patches, and package-age controls; inspect current security status before
reactivating a fork. Do not claim archived dependencies remain secure.

## Credentials and automation

`.infisical.json` is the historical development project binding. It has no
reviewed per-service proxy path. The launchers in `scripts/infisical/` use a
historical credential-injection flow and must not run against real credentials
without a separately authorized compatible route. Do not retrieve credentials,
use another project's binding, or silently migrate the source scope. Local
mocked tests do not need service access.

Repository-wide GitHub Actions is disabled. The production caller is inert and
Dependabot version-update PR limits are zero. Preserve these retirement guards.
The former shared delivery architecture is documented in
`docs/production-delivery.md`; it is not an instruction to deploy.

Keep investigation records and QA evidence under ignored `.internal/`. Never
publish session reports or credential values. GitHub-managed PR refs and cached
pre-rewrite commits require GitHub Support review; closing PRs or deleting
branches alone does not purge them. Obtain approval for destructive removals and
show complete outbound drafts before sending them.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
