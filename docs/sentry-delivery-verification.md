# Sentry delivery: gadash.tsilva.eu

Checked on 2026-10-06. This is the single domain declared in root `.repo-metadata.toml`.

## Production identity

Vercel's deployment lookup for `gadash.tsilva.eu` reports production deployment `dpl_DmrGwzPcfh99GW1vtnEuzdwifDXd`, state `READY`, branch `main`, source commit `e3faf2e6cad52c79ffd9a817acbc4edae83159c3`, and deployment URL `gadash-mms04z7xd-tsilvas-projects.vercel.app`. The source is a CLI deployment, so the commit metadata alone does not prove its uploaded files exactly match that Git tree. The domain lookup was repeated after the interrupted session and returned the same deployment.

## Confirmed setup and delivery blocker

- The live browser bundle initializes Sentry with a nonempty DSN, enabled state `true`, and environment `production`. Its target project ID is `4511185304092753`.
- The live HTTPS response's enforced CSP omits that DSN's ingestion origin from `connect-src`. With no configured tunnel, this policy prevents direct browser collection requests. This is HTTP header and bundle evidence; browser Network confirmation could not be obtained.
- `instrumentation-client.ts` initializes the browser SDK before hydration. There is no Sentry-specific consent or sign-in gate. Google Analytics consent is separate.
- `instrumentation.ts` loads Node and edge configurations and exports request-error capture; `app/global-error.tsx` captures React errors. No new initialization hook is needed.
- Production Vercel variable metadata includes browser/server DSNs and source-map configuration. Values were not printed. Current project variables are not proof of deployment runtime delivery.
- There is no custom ingestion route/tunnel. `/api/sentry/smoke` captures a server error and is protected by a header token. The production variable listing did not include that token.
- `.env.example` declares organization/project `tsilva` / `gadash`; mapping the live numeric project ID to those names has not been confirmed in Sentry. Server and browser target equality, effective server environment, and delivered-event release also remain unverified.

## Local repair

The proxy now passes the configured browser DSN to the security-header builder. The CSP permits its exact HTTPS origin, without credentials, path, or wildcard allowances. Invalid or unsafe URLs leave the policy unchanged.

The protected smoke route returns 503 when the SDK is disabled or flushing times out. Its response reports `eventId` and `queueFlushed` instead of claiming successful delivery. SDK queue drainage can occur even when ingestion rejects an envelope; dashboard verification remains necessary.

README verification guidance and tests cover these behaviors. Tests use an in-memory SDK transport and do not contact Sentry.

## Checks and remaining evidence

- All 88 tests passed, including CSP and smoke-route regressions.
- Production build passed with Sentry DSNs and upload token explicitly blanked, telemetry disabled, and an isolated output directory.
- Type checking passed. Source lint passed when excluding existing `.next-dev-*` generated output and temporary verification tooling; plain `eslint .` encounters errors in that pre-existing generated output.
- No Sentry dashboard connector is available. Superset browser/integration CLI access is unavailable in this environment. An isolated Chrome attempt did not expose a usable debugging endpoint, so no browser collection response was captured.
- No synthetic event was sent to Sentry, deployment performed, or external configuration changed. Repairs are uncommitted.

Status: **setup confirmed; browser delivery blocked by the current production CSP; event acceptance and dashboard arrival unverified**. Deploying this repair and sending a synthetic event require user approval. Completion requires matching one browser error event ID to a successful envelope response and the same error event in the intended Sentry project with environment `production`. A server smoke response or session/transaction traffic cannot substitute for that evidence.

References: [Sentry CSP configuration](https://www.sentry.help/en/articles/13965155-how-do-i-configure-my-content-security-policy-csp-to-allow-sentry), [CSP connect-src specification](https://www.w3.org/TR/CSP/#directive-connect-src).
