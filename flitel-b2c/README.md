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

Search supports adult passengers, one-way and round-trip travel, the ten existing airport choices, dates and economy/business cabin class. Results support stops and airline filters and price/duration sorting. Price sorting is disabled when offers use different currencies. With the backend connected, a test offer can be booked end to end: traveller details, review, confirmation (Duffel test mode, no real ticket). If a fare becomes unavailable, the page looks for the same flight again and shows the refreshed fare.

When `FLITEL_API_URL` is absent, the original five sample offers remain available for UI development. Those sample fares are per adult and include an indicative return price, without a selected return flight.

## Hotels

`/hotels` searches hotels, `/hotels/[hotelId]` lists rooms, and `/hotels/[hotelId]/book` collects the lead guest's details and shows LiteAPI's embedded card form. After payment LiteAPI returns the customer to `/hotels/complete`, which confirms the booking and redirects to `/hotel-bookings/[bookingId]?ref=…`.

- Needs the backend with `LITEAPI_KEY` set (LiteAPI **sandbox** key). Without it the pages say hotels are not available yet.
- Card details go straight to LiteAPI's form; Flitel never receives them.
- The card is charged before the booking call. If the answer is unclear the page says "We're checking your booking", keeps the guest details in this browser tab only, and offers "Check again", which is safe to repeat because the backend books each payment once.
- Test card in the sandbox: 4242 4242 4242 4242, any CVV, any future expiry.

## Not included yet

No customer accounts, saved details, emails, cancellations or "My bookings". Flights and hotels run in supplier test/sandbox mode only; live-mode responses are rejected. Supplier behaviour can only be verified after a Duffel test token and a LiteAPI sandbox key are configured in the backend.

Images and licenses are documented in public/images/SOURCES.md. The two user videos are references only and are not distributed with the app.
