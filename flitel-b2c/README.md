# Flitel B2C

Frontend project: `flitel-b2c`. Its backend project is `../flitel-b2c-service`.

The first customer flight experience, built with Next.js 16, React 19, TypeScript, Tailwind 4 and Zod. The search, results and flight-detail pages are connected by a plane animation. Reduced-motion preferences disable that animation.

## Run locally

Use Node.js 24 or later.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:3000.

```sh
npm test
npm run typecheck
npm run build
```

## Connect the backend

Copy `.env.example` to `.env.local` and run `flitel-b2c-service` on port 3001:

```env
FLITEL_API_URL=http://127.0.0.1:3001
```

Restart the frontend after changing this setting. This URL is server-only. The Duffel token belongs exclusively in the backend environment.

With `FLITEL_API_URL` set, search and details call the Hono backend and display Duffel test offers. The search page renders immediately, then its same-origin `/api/flights/search` route proxies the backend’s NDJSON stream without buffering. Offers appear as batches arrive, with a progress message until completion. Leaving the page cancels the request. An interrupted search preserves received offers and marks them incomplete; failures never silently return sample fares.

Only the first 20 matching cards render initially; Show more adds 20. Filters and sorting still use every received offer. Submitting the same search starts a fresh request, which can use the backend’s valid cached results.

Each supplier total already includes every requested adult and both journeys for round trips. Currencies, connections, local airport times, baggage details, fare conditions and offer expiry come from the supplier. Unknown details remain unspecified. Selecting an offer fetches its current details and price again.

## Current scope

Search supports adult passengers, one-way and round-trip travel, the ten existing airport choices, dates and economy/business cabin class. Results support stops and airline filters and price/duration sorting. Price sorting is disabled when offers use different currencies. Test offers cannot be booked.

When `FLITEL_API_URL` is absent, the original five sample offers remain available for UI development. Those sample fares are per adult and include an indicative return price, without a selected return flight.

This version does not reserve seats, collect payments, authenticate customers or store personal details. Live-mode offers are rejected. Supplier access can only be verified after a Duffel test token is configured in the backend.

Images and licenses are documented in public/images/SOURCES.md. The two user videos are references only and are not distributed with the app.
