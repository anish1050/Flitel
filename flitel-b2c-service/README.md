# Flitel B2C Service

Hono API for the `../flitel-b2c` frontend. Uses Node.js 24, TypeScript, Zod, the native MongoDB driver and the Duffel Flights API v2 through native `fetch`.

## Local setup

1. Install Node.js 24 and run `npm install` in this folder.
2. Copy `.env.example` to `.env.local` if `.env.local` does not already exist. Start local MongoDB at `mongodb://localhost:27017/`; the configured database is `flitel`.
3. Set `DUFFEL_ACCESS_TOKEN` in `.env.local` to your `duffel_test_...` token. Keep this file out of Git and never use a `NEXT_PUBLIC_` variable for the token.
4. Run `npm run setup:db` once to create the flight-search cache expiry index. The command reports the collection count and refuses to add the index over unexpected existing records.
5. Run `npm run dev`. The API listens at `http://127.0.0.1:3001`.
6. Restart the backend after changing `.env.local`. The scripts load this file; the older `.env` file is no longer loaded.

The server starts without a token or a database connection. Flight endpoints return `503 DUFFEL_NOT_CONFIGURED` until a test token is configured. The `duffelConfigured` flag checks configuration format, not Duffel account access. Live tokens are refused in this phase.

| Variable              | Default                                                    | Purpose                         |
| --------------------- | ---------------------------------------------------------- | ------------------------------- |
| `PORT`                | `3001`                                                     | Local server port               |
| `FRONTEND_ORIGIN`     | `http://127.0.0.1:3000`                                    | Single permitted browser origin |
| `DUFFEL_ACCESS_TOKEN` | Empty                                                      | Duffel test token, backend only |
| `MONGODB_URI`         | Required; local template uses `mongodb://localhost:27017/` | Server-side database connection |
| `MONGODB_DBNAME`      | `flitel`                                                   | Database name                   |

`src/mongodb.ts` reuses one connection pool and exposes the `flights` collection. Connections open when needed, with a three-second operation timeout. Health runs a read-only ping: it returns 200 with `mongodbConnected: true` when connected, or 503 with `status: "degraded"` and `mongodbConnected: false` when unavailable. Connection errors and URIs are not exposed. Successful searches may write temporary results to `flight_searches`; existing `flights` documents remain unchanged.

## API

Import the [Postman collection](../docs/Flitel%20B2C%20API.postman_collection.json). It contains no credentials.

| Endpoint                               | Response                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GET /api/health`                      | `{ "status": "ok", "duffelConfigured": false, "mongodbConnected": true, "mode": "test" }`   |
| `POST /api/flights/search`             | `{ "data": { "id": "orq_...", "live_mode": false, "offers": [...], "passengers": [...] } }` |
| `POST /api/flights/search?stream=true` | Newline-delimited JSON offer batches followed by completion or a safe error                 |
| `GET /api/flights/offers/:id`          | `{ "data": <Duffel offer> }`                                                                |
| `POST /api/bookings`                   | `{ "data": { "orderId": "ord_..." } }`, or `202 { "data": { "status": "checking" } }` when the outcome is unknown |
| `GET /api/bookings/:orderId`           | `{ "data": <Duffel order> }`                                                                |

Search accepts JSON:

```json
{
  "from": "BOM",
  "to": "DXB",
  "depart": "2026-10-14",
  "returnDate": "2026-10-21",
  "travellers": 2,
  "cabin": "economy",
  "trip": "round-trip"
}
```

Use future dates. Airport codes must be three uppercase letters; departure must be today or later using the UTC calendar date. Supported cabins are `economy` and `business`; trips are `one-way` and `round-trip`. Omit `returnDate` for a one-way search. A round trip requires a return date on or after departure. `travellers` is an integer from 1 to 9 and every passenger is an adult.

Offer objects are returned with their original supplier fields after basic validation. `total_amount` is a decimal string in `total_currency` for the entire offer and all passengers; do not multiply it by passenger count or by two for returns. Preserve offer and passenger IDs. Search includes both slices of a round trip. Show each segment's operating carrier and use the supplied baggage and fare conditions.

Refresh the selected offer using its ID. An expired or unavailable offer returns `410 OFFER_UNAVAILABLE`; the customer should search again. Results can also be empty. No mock results are returned by this API.

Booking accepts `{ attemptId, offerId, expectedTotal, expectedCurrency, travellers, contact }`. `attemptId` is a UUID that the client creates per confirm attempt. Repeating it never books twice; the recorded result is returned instead. The order is paid from the Duffel test balance using the amount of the offer the server has just fetched. `expectedTotal` only detects price changes (`409 PRICE_CHANGED`). A timeout, 5xx or unreadable Duffel reply returns `202 checking`, because seats may have been booked. Attempts are stored in `booking_attempts` without traveller details.

Errors use `{ "error": { "code": "...", "message": "..." } }`. Invalid local input returns 400, oversized requests 413, supplier-rejected searches 422, supplier/configuration outages 502/503 and timeouts 504. Upstream response bodies and credentials are not exposed. Flight responses use `Cache-Control: no-store`.

## Progressive search and cache

With `?stream=true`, the API requests Duffel batches and writes each available group as an NDJSON line:

```json
{"type":"offers","offers":[...]}
{"type":"complete"}
```

If a supplier request fails after streaming starts, the final line is `{ "type": "error", "message": "Flight search could not be completed. Please try again." }`. Input and token errors still return normal JSON before the stream starts. Offer IDs are deduplicated across batches. The supplier client key is never forwarded. Disconnecting cancels that stream's supplier polling; simultaneous streams have independent cancellation. Polling has a 23-second deadline and a maximum of 100 batches.

Both search formats share completed results in `flitel.flight_searches`. The cache key covers the validated route, dates, trip, cabin, adult count, API cache version, test mode and a SHA-256 credential fingerprint. Tokens are neither stored nor logged. An unused one-way return date does not change the key. Missing credentials are rejected before lookup.

Results expire after at most 120 seconds, or 30 seconds before the earliest offer expires, whichever comes first. MongoDB removes expired documents through the `expiresAt` TTL index; application queries also check expiry. Empty, nearly expired, partial or oversized results are not cached. Cache operations have 250 ms deadlines, and database failures fall back to Duffel. Concurrent identical full-JSON requests share one supplier request within a server process; active streams run independently. Selected-offer details always go back to Duffel.

`X-Flight-Cache` reports `HIT`, `MISS` or `BYPASS` for diagnostics. For streams it describes the initial lookup because headers are sent before subsequent cache writes. Browser and CDN caching remain disabled.

## Checks and deployment

```sh
npm test
npm run typecheck
npm run build
npm start
```

Tests mock Duffel and MongoDB. Verify account access with a real test-token search after configuring credentials. The Node build runs from `dist/server.js`.

For Vercel, select this folder as the project root and Node.js 24. `src/index.ts` default-exports the Hono app for [Vercel's native Hono support](https://vercel.com/docs/frameworks/backend/hono). Configure the test token, exact frontend origin and database variables in Vercel's environment settings. A hosted deployment needs a reachable MongoDB instance; `localhost` refers to the deployed server, not your computer. Local `PORT` does not configure Vercel routing. No deployment is created by this setup.

## Current scope

This phase supports test flight search, temporary search caching and offer details. Supplier searches have a 10-second deadline within a 20-second HTTP timeout; batch polling is capped at 23 seconds overall. Payments, booking creation, login, webhooks and booking persistence will be added with checkout. Before a public launch, configure deployment access/rate controls and complete the live-booking flow; CORS is not authentication.

Supplier contracts: [offer requests](https://duffel.com/docs/api/offer-requests), [batch offer requests](https://duffel.com/docs/api/batch-offer-requests), [offers](https://duffel.com/docs/api/offers).
