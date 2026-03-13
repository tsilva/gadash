# GADash

Client-side Next.js dashboard for GA4 Realtime data. Each viewer signs in with Google and the app auto-discovers the GA4 properties their account can access.

The app keeps the live OAuth access token only in `sessionStorage`, so reloading the same tab stays signed in until the token expires or the tab is closed. It also keeps a local session marker for best-effort silent restore on trusted browsers. On shared devices, use the in-app `Sign out` button before closing the tab.

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Create a Google OAuth client of type `Web application`.
4. Enable both the Google Analytics Data API and the Google Analytics Admin API for that Google Cloud project.
5. Add `http://localhost:3000` and your production domain to the OAuth client's Authorized JavaScript origins.
6. Fill in:
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
   - `NEXT_PUBLIC_GOOGLE_AUTHORIZED_ORIGINS`
   - `NEXT_PUBLIC_GA_PROPERTIES_JSON` only if you want a fallback list when Admin API discovery is unavailable

Optional fallback properties JSON:

```json
[
  { "id": "123456789", "label": "Main Site", "sortOrder": 1 },
  { "id": "987654321", "label": "Docs", "sortOrder": 2 }
]
```

## Run

```bash
npm install
npm run dev
```

## Deploy

- Host the app on Vercel.
- Put Cloudflare in front as DNS/CDN only.
- Add the production origin to both `NEXT_PUBLIC_GOOGLE_AUTHORIZED_ORIGINS` and the Google OAuth client.
- Vercel preview URLs are intentionally not part of v1 unless you explicitly register them with Google.
- Keep the app's security headers intact in production. Edge/CDN rules must not weaken the shipped `Content-Security-Policy`, framing protections, or related browser hardening headers.
- The app sends baseline security headers itself, including CSP, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, and a restrictive `Permissions-Policy`.
- Silent restore is intended only for trusted browser profiles where re-opening the dashboard should reuse an active Google session without another consent prompt.
