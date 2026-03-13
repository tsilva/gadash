# GADash

Client-side Next.js dashboard for GA4 Realtime data. Each viewer signs in with Google and the app auto-discovers the GA4 properties their account can access.

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
