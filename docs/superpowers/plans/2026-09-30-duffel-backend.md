# Duffel Backend Implementation Plan

**Goal:** Connect Flitel's flight search and details to Duffel test mode, ready for a test token.

**Architecture:** `flitel-b2c-service` owns request validation, secret credentials and Duffel HTTP calls. The Next.js server in `flitel-b2c` calls the backend and maps supplier offers into the existing UI. Missing credentials produce a clear unavailable response. Demo mode remains explicit when no backend URL is configured.

**Stack:** Node.js 24, Hono, TypeScript, Zod, native fetch, MongoDB and Vitest. MongoDB uses the local `flitel` database and existing `flights` collection. Persistent booking workflows remain outside this phase.

## Backend

- [x] Create package, TypeScript config, local entry and environment template.
- [x] Test health, invalid searches, missing credentials, round trips, offer refresh, expiry and safe supplier errors before implementing routes.
- [x] Implement `/api/health`, `POST /api/flights/search`, and `GET /api/flights/offers/:id`.
- [x] Require test credentials, bound request bodies and supplier timeouts, and keep tokens out of responses and logs.
- [x] Configure local MongoDB in `.env.local` and verify `flitel.flights` without changing its records.

## Frontend

- [x] Add server-side backend calls using `FLITEL_API_URL` and no caching.
- [x] Test mapping of full itineraries, supplier totals/currencies, expired offers and empty results.
- [x] Show actual outbound/return connections, adult passenger totals and supplier conditions in test mode.
- [x] Keep explicit demo mode and show errors without substituting invented offers.

## Handoff

- [x] Document setup and create a credential-free Postman collection.
- [x] Run both projects' tests, typechecks and builds.
- [x] Verify both local servers and browser search/error flows.
- [x] Review security, price semantics, readability and comments.

Duffel test-token access was verified on 30 September 2026: search and offer details returned HTTP 200, and the frontend displayed supplier results. This phase creates no reservations, payments or authentication records.

Browser verification used the real local backend with a synthetic Duffel response: a round trip with a connection, two adults, baggage and a USD 450.25 full journey total. The connected frontend also showed a clear unavailable state with the actual blank-token backend. Desktop and mobile layouts had no horizontal overflow.

Initial setup validation: 11 backend tests and 13 frontend tests passed; both typechecks and builds passed. Local MongoDB ping succeeded, the `flitel.flights` collection exists, and its estimated document count is zero. That setup did not change database data or indexes.

## Faster search follow-up

The user requested a `flight_searches` MongoDB cache and results arriving in parts. An uncached search took 7.5 seconds. A separate Duffel batch probe returned its first offer at 2.1 seconds and completed at 5.6 seconds.

- [x] Cache successful complete searches in `flitel.flight_searches` for at most 120 seconds, bounded by the earliest offer expiry with a 30-second margin.
- [x] Match every search field and credential identity; never store access tokens or Duffel client keys.
- [x] Add TTL cleanup and check expiry in application queries. Bypass unavailable MongoDB and oversized cache documents.
- [x] Stream Duffel batch offers through the backend and same-origin frontend proxy; stop incomplete searches on cancellation and never cache partial results.
- [x] Render the search shell immediately, update results as batches arrive, and display 20 cards at a time.
- [x] Preserve full-result JSON requests and fresh offer details.
- [x] Verify cold/warm timings, cache metadata, partial results, repeat search, filters and offer refresh.

Final verification: 20 backend tests and 19 frontend tests pass, with both typechecks and production builds passing. Independent review confirmed separate cancellation for simultaneous streams and a 4 KB request limit in the frontend proxy.

The final local timing run returned the first batch in 1.13 seconds and all 113 offers in 2.70 seconds; the identical MongoDB-cached stream took 124 ms. Cached JSON took 97 ms. Fresh offer details returned HTTP 200 with two passengers and both itinerary slices. These are local test-mode measurements, not latency guarantees.

MongoDB readback confirmed the `expiresAt_ttl` index with `expireAfterSeconds: 0`. Browser checks confirmed the search form and route heading while loading, one usable offer while later batches arrived, 20 initial cards, 40 after Show more, working non-stop filtering, and a reset after repeating the same search. The credential-free Postman collection includes the progressive endpoint.
