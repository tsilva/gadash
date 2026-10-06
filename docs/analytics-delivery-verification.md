# Google Analytics delivery: gadash.tsilva.eu

Inspected 2026-10-06. Scope: the single domain declared in root `.repo-metadata.toml`.

## Production evidence

- Vercel's deployment lookup for `gadash.tsilva.eu` reports production deployment `dpl_DmrGwzPcfh99GW1vtnEuzdwifDXd`, READY, with commit `e3faf2e6cad52c79ffd9a817acbc4edae83159c3` on `main`. Local HEAD matches. Its source is CLI, so commit metadata does not prove that every uploaded file matches the commit. The team's domain-filtered alias listing returned no entries; that listing provides no independent alias confirmation.
- Vercel configuration lists `NEXT_PUBLIC_GA_MEASUREMENT_ID` for Production. No value was decrypted or printed. Live HTML includes a configured Google tag, but intended GA4 stream ownership remains unverified.
- Read-only HTTP inspection returns 200 and a nonce-based CSP. The deployed tag props use `lazyOnload` with no explicit nonce, while framework scripts have nonces. The installed Next.js client implementation uses the original props in its lazy loader, supporting an inline-script CSP failure. This is a source/HTML diagnosis, not an observed browser console error.
- The CSP permits the tag loader and the standard and region1 Google Analytics collection hosts. No custom collection route, transport URL, consent manager, or website tracking consent command was found in application source. Google OAuth permissions authorize reading dashboard data; they do not grant consent to track website visits. Vercel Analytics is separate.

## Prepared repair

- Read the request nonce in the root layout and pass it explicitly to both Google scripts.
- Initialize after hydration rather than during browser idle time.
- Load neither Google script before explicit website tracking consent. Provide allow, decline, and withdrawal controls, persist the preference for 180 days, and keep advertising consent denied. Withdrawal disables collection immediately and reloads without the tag.
- Add local regression checks for consent gating, invalid configuration, and command ordering without loading Google scripts or making collection requests.

## Delivery status and remaining evidence

**Setup confirmed; delivery unverified.** No accepted browser `page_view` response or corresponding GA4 dashboard event has been observed in this session. The Superset browser CLI is blocked by filesystem permissions, no browser tool or GA4 connector is available, and no authenticated GA4 dashboard access has been established. Read-only HTML fetches do not execute the tag or prove collection.

All repair changes remain local and uncommitted. No synthetic event, deployment, or external configuration change has been performed. Live verification requires an approved test visit with tracking consent, browser collection response evidence, and authenticated access to the intended GA4 stream. Preserve measurement IDs and credentials privately.

## Local checks

- Focused analytics, CSP, and page tests: 12 passed under Bun 1.3.14, using the repository's Node-test-style files. The configured Node runner cannot start because the sandbox blocks its shared library; pnpm is also blocked. Bun results do not substitute for verification with the configured Node runner.
- Broader Bun run: 86 passed, two failures outside this repair. The dependency check cannot launch pnpm; a concurrently added Sentry smoke test fails under Bun (503 versus 200). Those unrelated files were preserved.
- Changed TypeScript files pass ESLint. Repository source lint also passes when the existing untracked `.next-dev-*` generated artifacts and `.codex` directory are excluded. Unfiltered lint reports generated-code errors in that pre-existing development output.
- Production build and TypeScript CLI cannot start in the available runtime (`CouldntReadCurrentDirectory`); no passing build or typecheck is claimed. Git whitespace checking passes, and no staged changes were made.

Implementation reference: Google's [consent-mode setup guide](https://developers.google.com/tag-platform/security/guides/consent) requires consent defaults before measurement commands; its [CSP guide](https://developers.google.com/tag-platform/security/guides/csp) describes nonce-authorized tag scripts.
