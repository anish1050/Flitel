# Hotel Booking (LiteAPI Sandbox) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers search hotels, choose a room, enter guest details, pay with their own card through LiteAPI's embedded payment form, and get a confirmation, all inside Flitel, against the LiteAPI sandbox.

**Architecture:** The Hono backend (`flitel-b2c-service`) gets a small LiteAPI client and hotel routes (search, rooms, prebook, once-only booking, read-back); it reuses the `booking_attempts` collection so one payment attempt books at most once. The Next.js app (`flitel-b2c`) gets a Hotels section (search/results, hotel page, guest + payment page, return page, confirmation page) and two proxy routes; the browser never calls the backend directly.

**Tech Stack:** Node 24, TypeScript, Hono 4, zod 4, MongoDB driver 7, Vitest 4, Next.js 16 (App Router), React 19, lucide-react, plain CSS in `globals.css`.

**Spec:** `docs/superpowers/specs/2026-10-12-hotel-booking-design.md` (binding, including "Payment safety"). Flight booking spec for context: `docs/superpowers/specs/2026-10-09-flight-booking-design.md`.

## Global Constraints

- LiteAPI sandbox only. The key is `LITEAPI_KEY` (server-side only, never `NEXT_PUBLIC_`). Refuse any search/rates/book response whose `sandbox` flag is present and not `true`. The card form runs with `publicKey: "sandbox"`.
- The browser never sets the amount charged. Card data never reaches Flitel.
- Guest details (names, email, phone) never go into URLs, logs, MongoDB or LiteAPI `clientReference`. A `booking_attempts` document holds only `_id` (attemptId), `offerId` (here: the prebookId), `amount`, `currency`, `status`, `orderId?` (here: the bookingId), `createdAt`, `updatedAt`.
- An outcome that is not proven (not `confirmed`, not an explicit rejection) is `unknown`: `202 { data: { status: "checking" } }`, shown as "We're checking your booking", never a retry.
- Errors use `{ "error": { "code": "...", "message": "..." } }`.
- Frontend: `flitel-b2c/AGENTS.md` — Next 16 differs from older versions; read the relevant guide in `flitel-b2c/node_modules/next/dist/docs/` before writing a page, route handler or client component. Vitest does not resolve `@/`; tests in `lib/` use relative imports and route tests mock `@/…` modules to relative imports, as the existing route tests do.
- Keep LF line endings (`.gitattributes` has `* text=auto eol=lf`). No new dependencies. Match surrounding code: comments only where they explain why, names like the existing `requestDuffel`, `parseDuffelOffer`, `createBooking`.
- Commit at the end of each task with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never commit `docs/supplier-enquiries.md` (contains a phone number) or `.claude/`.

## LiteAPI facts (from its official docs; verify against responses when a key is available)

- Auth: header `X-API-Key: <LITEAPI_KEY>`.
- Search/rates base: `https://api.liteapi.travel/v3.0`. `POST /hotels/rates` body: `{ hotelIds? | countryCode+cityName, occupancies: [{ adults, children? }], currency, guestNationality, checkin, checkout, timeout?, includeHotelData?, limit?, maxRatesPerHotel? }`. Response: `{ data: [{ hotelId, roomTypes: [{ offerId, name?, rates: [{ rateId, name, boardName, boardType, retailRate: { total: [{amount, currency}], taxesAndFees: [{included, description, amount, currency}] }, cancellationPolicies: { cancelPolicyInfos: [{cancelTime, amount, currency, timezone}], refundableTag: "RFN"|"NRFN" } }], offerRetailRate: {amount, currency} }] }], hotels: [{ id, name, main_photo, thumbnail, address, rating, stars, city_name }], sandbox: boolean }`.
- Hotel details: `GET /data/hotel?hotelId=` → `{ data: { id, name, hotelDescription, address, city, country, starRating, rating, main_photo, hotelImages: [{url, defaultImage}], facilities: [{facilityId, name}], hotelFacilities: string[], checkinCheckoutTimes } }`.
- Prebook: `POST https://book.liteapi.travel/v3.0/rates/prebook` body `{ offerId, usePaymentSdk: true }` → `{ data: { prebookId, hotelId, checkin, checkout, currency, price, priceDifferencePercent, cancellationChanged, boardChanged, transactionId, secretKey, roomTypes: [...] } }`; errors 400/4002 invalid offerId, 408/4040 outdated offerId, 408/4016 timeout, 401.
- Book: `POST https://book.liteapi.travel/v3.0/rates/book` body `{ prebookId, clientReference, holder: { firstName, lastName, email, phone }, guests: [{ occupancyNumber, firstName, lastName, email }], payment: { method: "TRANSACTION_ID", transactionId } }` → `{ data: { bookingId, status: "CONFIRMED", hotelConfirmationCode?, checkin, checkout, hotel: { hotelId, name }, holder, price, currency, cancellationPolicies, createdAt }, sandbox }`; errors are `{ error: { code, description, message } }` with HTTP 400 codes 4000/4002/4003/4005/4010/2013/2014/5000, 410 code 4012.
- Booking read-back: `GET https://book.liteapi.travel/v3.0/bookings/{bookingId}` → `{ data: { bookingId, status, clientReference, hotelConfirmationCode?, hotel: { hotelId, name }, checkin, checkout, bookedRooms: [...], holder: { firstName, lastName, email, phone }, price, currency, cancellationPolicies, createdAt } }`.
- Payment SDK: script `https://payment-wrapper.liteapi.travel/dist/liteAPIPayment.js?v=a1`; `new LiteAPIPayment({ publicKey: "sandbox", secretKey, returnUrl, targetElement: "#id", appearance: { theme: "flat" }, options: { business: { name: "Flitel" } } }).handlePayment()`; after payment the browser is redirected to `returnUrl`. Sandbox test card: 4242 4242 4242 4242, any CVV, any future expiry.

## File map

Backend `flitel-b2c-service/src/`:
- Create `liteapi.ts`, `liteapi.test.ts`: key reader, request helper, sandbox guard, error-envelope parsing.
- Create `hotels.ts`, `hotels.test.ts`: request schemas and normalisers for search, rooms, prebook, booking read-back, and the book-outcome classifier.
- Create `hotel-routes.ts`, `hotel-routes.test.ts`: the Hono sub-app with the five routes.
- Modify `index.ts`: mount the sub-app. Modify `../README.md`, `../.env.example`.

Frontend `flitel-b2c/src/`:
- Create `lib/hotels.ts` (+ `.test.ts`): destinations, stay query schema/parsing/building, nights, shared response types and schemas.
- Create `lib/hotel-api.ts` (+ `.test.ts`): server-only calls to the backend.
- Create `lib/hotel-booking.ts` (+ `.test.ts`): guest schema, pending-attempt storage helpers, booking-outcome classifier.
- Create `app/api/hotels/prebook/route.ts`, `app/api/hotel-bookings/route.ts` (+ tests).
- Create `app/hotels/page.tsx`, `app/hotels/[hotelId]/page.tsx`, `app/hotels/[hotelId]/book/page.tsx`, `app/hotels/complete/page.tsx`, `app/hotel-bookings/[bookingId]/page.tsx`.
- Create `components/hotel-search-form.tsx`, `components/hotel-payment.tsx`, `components/hotel-complete.tsx`.
- Modify `components/site-header.tsx`, `app/globals.css`.

---

### Task 1: Backend LiteAPI client, hotel search and rooms

**Files:**
- Create: `flitel-b2c-service/src/liteapi.ts`, `flitel-b2c-service/src/liteapi.test.ts`
- Create: `flitel-b2c-service/src/hotels.ts` (search/rooms parts), `flitel-b2c-service/src/hotels.test.ts`
- Create: `flitel-b2c-service/src/hotel-routes.ts`, `flitel-b2c-service/src/hotel-routes.test.ts`
- Modify: `flitel-b2c-service/src/index.ts` (mount), `flitel-b2c-service/.env.example`

**Interfaces:**
- Produces from `liteapi.ts`:
  - `readLiteapiKey(): string | undefined` (trimmed `LITEAPI_KEY`)
  - `requireLiteapiKey(): string` (raises `503 LITEAPI_NOT_CONFIGURED` "Hotel booking isn't available yet.")
  - `type LiteapiResult = { status: number; body: unknown }`
  - `requestLiteapi(host: "api" | "book", path: string, options?: { method?: "GET" | "POST"; body?: unknown; timeoutMs?: number; signal?: AbortSignal }): Promise<LiteapiResult>` — sends `X-API-Key`, JSON, `https://api.liteapi.travel/v3.0` or `https://book.liteapi.travel/v3.0`; default timeout 20 000 ms; returns the status and parsed JSON (null when unparseable) and **throws `LiteapiUnreachable`** (exported class) on network error or timeout, so callers can tell "no answer" from "an answer".
  - `liteapiErrorCode(body: unknown): number | undefined` — numeric `error.code` from the error envelope (accept a numeric string).
  - `assertSandbox(body: unknown): void` — raises `503 LITEAPI_LIVE_REFUSED` when `body.sandbox === false`.
- Produces from `hotels.ts`: `staySchema` (zod: `countryCode` `/^[A-Z]{2}$/`, `cityName` 1–80 chars, `checkin` / `checkout` ISO dates with checkin ≥ today (UTC) and checkout after checkin and ≤ 30 nights, `adults` int 1–9, `currency` `/^[A-Z]{3}$/`, `guestNationality` `/^[A-Z]{2}$/`), `type Stay`, `roomsStaySchema` (the same without `countryCode`/`cityName`), `summariseHotels(raw: unknown): HotelSummary[]`, `normaliseRooms(raw: unknown, hotelId: string, details?: unknown): { hotel: HotelDetail; rooms: Room[] }`, and the exported types `HotelSummary = { id, name, photo?, address?, stars?, rating?, price: { amount: number; currency: string }, refundable: boolean }`, `Room = { offerId, name, boardName?, refundable: boolean, cancelBefore?: string, price: { amount: number; currency: string }, taxesNotIncluded: { description: string; amount: number; currency: string }[] }`, `HotelDetail = { id, name, photo?, address?, stars?, rating?, description?, images?: string[], facilities?: string[] }`.
- Produces the HTTP routes `POST /api/hotels/search` and `POST /api/hotels/:hotelId/rates` (contracts in the spec). `hotelId` is validated `^[A-Za-z0-9_-]{2,40}$` (400 `INVALID_HOTEL_ID`). Bodies are validated with the schemas above (400 `INVALID_STAY` with the first issue message). Body limit 4 KB (413 `REQUEST_TOO_LARGE`). `hotel-routes.ts` exports `hotelRoutes` (a Hono app) — later tasks add routes to it.

**Requirements:**
- `search`: `requireLiteapiKey()`; `POST /hotels/rates` with `{ countryCode, cityName, occupancies: [{ adults }], currency, guestNationality, checkin, checkout, timeout: 6, includeHotelData: true, maxRatesPerHotel: 1, limit: 40 }` through `requestLiteapi("api", ...)`; `assertSandbox`; non-2xx → `502 HOTELS_UNAVAILABLE` ("Hotels are unavailable right now. Nothing was booked."), `LiteapiUnreachable` → `504 HOTELS_TIMEOUT` ("Hotel search took too long. Please try again."); a 2xx whose body fails the schema → `502 LITEAPI_INVALID_RESPONSE`. A 404 or a body with an empty `data` is an empty list (`{ data: { hotels: [] } }`), not an error.
- `summariseHotels`: one summary per hotel that has at least one priced room type; price = the cheapest `offerRetailRate` across its room types; `refundable` = every rate of that cheapest offer has `refundableTag === "RFN"`; join with `hotels[]` by id for name/photo (`main_photo` else `thumbnail`)/address/stars/rating, falling back to the name "Hotel" if missing; sort by price ascending; amounts stay as the numbers LiteAPI sent (no arithmetic beyond comparison).
- `rates`: `POST /hotels/rates` with `hotelIds: [hotelId]`, `includeHotelData: true`, `timeout: 6`, same stay fields; in parallel `GET /data/hotel?hotelId=` with a 4 s timeout whose failure is ignored; `normaliseRooms` makes one `Room` per room type (name = first rate's name, board from the first rate, `refundable` = all rates RFN, `cancelBefore` = first `cancelPolicyInfos[0].cancelTime` of the first rate when refundable, taxes from rates' `taxesAndFees` where `included === false`), cheapest first. No rooms → `200` with `rooms: []`. Hotel description: strip HTML tags from `normalizedDescription ?? hotelDescription`, cap 1 200 chars; images: up to 8 `hotelImages[].url`; facilities: up to 12 `hotelFacilities`.
- Never cache; never log request bodies or the key.

**Tests (write first, see them fail):** `liteapi.test.ts`: header and URL per host, timeout/network → `LiteapiUnreachable`, unparseable body → `body: null`, error code extraction, `assertSandbox`. `hotels.test.ts`: summarise (cheapest offer wins, refundable derivation, sorted, missing hotel data fallback, unpriced hotels dropped), rooms (board/refundable/tax mapping, details enrichment optional), schema rejections (past checkin, checkout ≤ checkin, > 30 nights, adults 0/10, bad country code). `hotel-routes.test.ts` with mocked global `fetch` (follow `src/bookings.test.ts`): success paths, 503 without key, 400s without calling LiteAPI, live (`sandbox: false`) refused, upstream 500 → 502, timeout → 504, empty results.

**Verify and commit:** `npm --prefix flitel-b2c-service test`, `npm --prefix flitel-b2c-service run typecheck`, pristine output. Commit `feat(api): LiteAPI client with hotel search and rooms`. Add `LITEAPI_KEY=` to `.env.example`.

---

### Task 2: Backend prebook, once-only hotel booking and read-back

**Files:**
- Modify: `flitel-b2c-service/src/hotels.ts`, `flitel-b2c-service/src/hotels.test.ts`
- Modify: `flitel-b2c-service/src/hotel-routes.ts`, `flitel-b2c-service/src/hotel-routes.test.ts`
- Modify: `flitel-b2c-service/README.md`

**Interfaces:**
- Consumes (Task 1): `requestLiteapi`, `LiteapiUnreachable`, `liteapiErrorCode`, `assertSandbox`, `requireLiteapiKey`, `hotelRoutes`, `raiseApiError` (from `duffel.ts`), and from the flight work `claimBookingAttempt`, `findBookingAttempt`, `recordBookingOutcome` (`booking-attempts.ts`).
- Produces from `hotels.ts`: `prebookRequestSchema` (`{ offerId }`, string `^[A-Za-z0-9_=+/.-]{8,4000}$`), `normalisePrebook(raw: unknown): Prebook` where `Prebook = { prebookId, transactionId, secretKey, hotelId, checkin, checkout, price: { amount: number; currency: string }, priceDifferencePercent: number, cancellationChanged: boolean, boardChanged: boolean, refundable: boolean }` (throws on an incomplete body), `hotelBookingRequestSchema` (`{ attemptId: uuid, prebookId: ^[A-Za-z0-9_-]{4,100}$, transactionId: ^[A-Za-z0-9_-]{4,200}$, expectedTotal: number > 0, expectedCurrency: ^[A-Z]{3}$, holder: { firstName, lastName: letters/space/'/- 1–50, email, phone: +E.164 } }`), `buildLiteapiBook(request): object` (the book body: holder, one guest `{ occupancyNumber: 1, firstName, lastName, email }`, `payment: { method: "TRANSACTION_ID", transactionId }`, `clientReference: attemptId`), `classifyBookResponse(result: LiteapiResult | "unreachable"): { kind: "confirmed"; bookingId: string } | { kind: "rejected" } | { kind: "room-unavailable" } | { kind: "not-authorised" } | { kind: "unknown" }`, `normaliseBooking(raw: unknown): HotelBooking`.
- Produces the routes `POST /api/hotels/prebook`, `POST /api/hotel-bookings`, `GET /api/hotel-bookings/:bookingId`.

**Requirements:**
- `prebook`: validate; `requireLiteapiKey`; `POST book/rates/prebook` `{ offerId, usePaymentSdk: true }` (timeout 30 s); `assertSandbox` when the flag is present; error code 4040 or 4002 or HTTP 408 with 4040 → `410 OFFER_UNAVAILABLE` ("This room is no longer available."); 401 → `503 HOTELS_UNAVAILABLE`; other non-2xx → `502 HOTELS_UNAVAILABLE`; unreachable → `504 HOTELS_TIMEOUT`; incomplete body → `502 LITEAPI_INVALID_RESPONSE`. Never log or persist `secretKey`.
- `hotel-bookings` follows the steps in the spec exactly: validate (400 `INVALID_BOOKING`), lookup/replay (MongoDB errors → `503 BOOKINGS_UNAVAILABLE`, nothing booked, also when `MONGODB_URI` is missing — the lookup must be inside an async function), claim with `{ _id: attemptId, offerId: prebookId, amount: String(expectedTotal), currency: expectedCurrency }`, `POST book/rates/book` (timeout 60 s), `classifyBookResponse`, record and answer: `confirmed` → record `confirmed` with the bookingId, `200`; `rejected` → record `failed`, `422 BOOKING_REJECTED`; `room-unavailable` → record `failed`, `410 ROOM_UNAVAILABLE`; `not-authorised` → record `failed`, `503 HOTELS_UNAVAILABLE`; `unknown` → record `unknown`, `202 { data: { status: "checking" } }`. A failed outcome write must not change the answer (swallow it) and a record left `pending` replays as `202 checking`. Replayed `failed` attempts answer `422 BOOKING_FAILED`. Body limit 8 KB.
- Classification: `200` + `data.status === "CONFIRMED"` + non-empty `data.bookingId` → confirmed; `assertSandbox` applies (a `sandbox: false` book response is treated as `unknown`, never "confirmed"); HTTP 400 with code 4000/4002/4003/4010 → rejected; HTTP 410, or code 4012 or 2013 → room-unavailable; HTTP 401/403 → not-authorised; everything else (including `unreachable`, 5xx, unparseable, codes 2014/4005/5000, `200` that is not CONFIRMED) → unknown. Put a one-line why-comment on the unknown fall-through: the card is charged before the book call, so an unproven outcome must never be reported as failed.
- `GET /api/hotel-bookings/:bookingId`: validate `^[A-Za-z0-9_-]{3,60}$` (400 `INVALID_BOOKING_ID`), `GET book/bookings/{id}`, 404/204/"not found" → `404 BOOKING_NOT_FOUND`, otherwise `normaliseBooking` (no phone) → `200`; unreachable/5xx → `502 HOTELS_UNAVAILABLE`.
- No guest data in logs, the attempt record or `clientReference`.

**Tests (write first):** unit tests for `normalisePrebook`, `buildLiteapiBook`, `classifyBookResponse` (every row of the table above, incl. unreachable and sandbox false), `normaliseBooking`; route tests with the same in-memory Mongo mock approach as `src/bookings.test.ts`: confirmed once and replayed with the same attempt → one book call; unknown on timeout and on 5xx and a repeat does not call LiteAPI again; rejected/room-unavailable recorded and replayed as `BOOKING_FAILED`; Mongo down (and `getDatabase` throwing synchronously) → 503 and zero LiteAPI calls; the stored attempt contains no name, email or phone; read-back normalises and omits the phone; prebook error mapping.

**Verify and commit:** full backend tests and typecheck, pristine. README: add the five hotel endpoints to the API table, the `LITEAPI_KEY` row to the variables table, and a short "Hotels" paragraph (sandbox only, how booking stays once-only). Commit `feat(api): prebook, once-only hotel booking and booking read-back`.

---

### Task 3: Frontend hotel libraries and proxy routes

**Files:**
- Create: `flitel-b2c/src/lib/hotels.ts`, `flitel-b2c/src/lib/hotels.test.ts`
- Create: `flitel-b2c/src/lib/hotel-api.ts`, `flitel-b2c/src/lib/hotel-api.test.ts`
- Create: `flitel-b2c/src/lib/hotel-booking.ts`, `flitel-b2c/src/lib/hotel-booking.test.ts`
- Create: `flitel-b2c/src/app/api/hotels/prebook/route.ts`, `flitel-b2c/src/app/api/hotels/prebook/route.test.ts`
- Create: `flitel-b2c/src/app/api/hotel-bookings/route.ts`, `flitel-b2c/src/app/api/hotel-bookings/route.test.ts`
- Modify: `flitel-b2c/.env.example` only if needed (no new variables are expected)

**Interfaces:**
- Consumes: `readJsonBody` (`lib/request-body.ts`), `hasFlightBackend` (`lib/flight-api.ts`, the backend URL is the same `FLITEL_API_URL`), `formatPrice` (`lib/flights.ts`).
- Produces `lib/hotels.ts`: `HOTEL_CURRENCY = "INR"`, `HOTEL_NATIONALITY = "IN"`; `hotelDestinations: { id: string; label: string; cityName: string; countryCode: string }[]` (Mumbai IN, New Delhi IN, Goa IN, Dubai AE, London GB, Singapore SG, Paris FR, Bangkok TH, Santorini GR, Malé MV — the `cityName` strings are LiteAPI's and may need tuning once a key exists, so keep them in this one table); `type StayInput = { destination: string; checkin: string; checkout: string; adults: number }`; `parseStayParams(params: Record<string, string | string[] | undefined>): StayInput` (throws a customer-safe Error: destination in the table, ISO dates, checkin today-or-later by the visitor's local date passed in as an optional `today` argument defaulting to the local date, checkout after checkin, ≤ 30 nights, adults 1–9); `buildStayQuery(stay: StayInput): string` (URLSearchParams string with keys `destination`, `checkin`, `checkout`, `adults`); `nightsBetween(checkin: string, checkout: string): number`; `findDestination(id: string)`; types and zod schemas for the backend responses: `HotelSummary`, `Room`, `HotelDetail`, `Prebook`, `HotelBooking` (same fields as the backend contracts).
- Produces `lib/hotel-api.ts` (starts with `import "server-only"` like `flight-api.ts`): `searchHotels(stay: StayInput): Promise<HotelSummary[]>`, `fetchHotelRooms(hotelId: string, stay: StayInput): Promise<{ hotel: HotelDetail; rooms: Room[] }>`, `prebookRoom(offerId: string): Promise<{ status: number; body: unknown }>`, `createHotelBooking(input: unknown): Promise<{ status: number; body: unknown }>` (an unreachable backend or timeout → `{ status: 202, body: { data: { status: "checking" } } }`; no `FLITEL_API_URL` → 503 `HOTELS_UNAVAILABLE`), `fetchHotelBooking(bookingId: string): Promise<HotelBooking>` (validates `^[A-Za-z0-9_-]{3,60}$` before any fetch). The search/rooms/booking readers throw `Error` with customer-safe messages ("Hotels are unavailable right now. Please try again shortly.", "We couldn't find this booking.", …) and validate responses with the zod schemas.
- Produces `lib/hotel-booking.ts`: `guestSchema` (zod: `firstName`, `lastName`, `email`, `phone` with the same messages as `lib/booking.ts`), `type GuestInput`, `fieldErrors` reuse (import from `./booking`), `type PendingHotelAttempt = { attemptId, prebookId, transactionId, expectedTotal: number, expectedCurrency: string, holder: GuestInput }`, storage helpers taking a `Storage | undefined` and never throwing: `savePendingHotelAttempt(storage, pending)`, `readPendingHotelAttempt(storage, attemptId): { state: "ready"; pending: PendingHotelAttempt } | { state: "checking" } | undefined`, `markHotelAttemptChecking(storage, attemptId)`, `clearHotelAttempt(storage, attemptId)` (key `flitel-hotel:<attemptId>`; value JSON; invalid JSON reads as `undefined`), and `classifyHotelBooking(status: number, body: unknown): { kind: "confirmed"; bookingId: string } | { kind: "checking" } | { kind: "failed"; code: string; message: string }` — `200` with a `data.bookingId` → confirmed; a body `error.code` in {`BOOKING_REJECTED`, `ROOM_UNAVAILABLE`, `BOOKING_FAILED`, `HOTELS_UNAVAILABLE`, `BOOKINGS_UNAVAILABLE`, `LITEAPI_NOT_CONFIGURED`, `INVALID_BOOKING`} → failed (message from a fixed table, not the server text); everything else, including unknown codes, non-JSON, 202, 5xx → checking.
- Produces the proxy routes `POST /api/hotels/prebook` (body ≤ 2 KB, `{ offerId }` shape-checked, then `prebookRoom`) and `POST /api/hotel-bookings` (body ≤ 8 KB, forwarded through `createHotelBooking`), both `Cache-Control: no-store`, 413 on oversize.

**Tests (write first):** `hotels.test.ts` — destination lookup, parsing valid/invalid params (unknown destination, past/inverted dates, > 30 nights, adults bounds, array-valued params), query round-trip, nights. `hotel-api.test.ts` — URLs and bodies sent to the backend, no-store, unreachable → 202 checking for booking, malformed id never fetches, schema failure → safe error (follow `lib/flight-api.test.ts`; `vi.mock("server-only", () => ({}))`). `hotel-booking.test.ts` — guest validation messages, storage helpers with a fake `Storage` (round trip, `checking` marker, clear, throwing storage never throws, corrupt JSON), classifier table (every code, 202, 500, HTML body, missing code). Route tests: 413, forwarding, status passthrough.

**Verify and commit:** `npm --prefix flitel-b2c test`, `npm --prefix flitel-b2c run typecheck`, `npm --prefix flitel-b2c run build`. Commit `feat(web): hotel libraries and proxy routes`.

---

### Task 4: Frontend hotel search, results and hotel pages

**Files:**
- Create: `flitel-b2c/src/components/hotel-search-form.tsx`
- Create: `flitel-b2c/src/app/hotels/page.tsx`, `flitel-b2c/src/app/hotels/[hotelId]/page.tsx`
- Modify: `flitel-b2c/src/components/site-header.tsx`, `flitel-b2c/src/app/globals.css`

**Interfaces:**
- Consumes (Task 3): `hotelDestinations`, `parseStayParams`, `buildStayQuery`, `nightsBetween`, `findDestination`, `searchHotels`, `fetchHotelRooms`, `formatPrice`, types.
- Produces: the pages `/hotels` and `/hotels/[hotelId]`, and room links `/hotels/[hotelId]/book?<stay query>&offerId=<offerId>` (the page itself is Task 5).

**Requirements:**
- `/hotels`: `SiteHeader` is already in the layout (check `app/layout.tsx`). A heading and a **native GET form** (`hotel-search-form.tsx`, server-renderable, no JS required): destination select, check-in and check-out `type="date"` (min today), adults select 1–9, submit "Search hotels". Pre-filled from the query. Defaults when no query: first destination, check-in 14 days ahead, check-out 2 nights later. When valid params are present, call `searchHotels` and render a results grid below: photo (plain `<img>` with `loading="lazy"` and an empty `alt` fallback; a neutral placeholder block when missing), name, stars, rating, address, "from ₹X for N nights" (`formatPrice` + `nightsBetween`), a "Free cancellation" tag when refundable, linking to `/hotels/<id>?<stay query>`. Invalid params → the form plus an inline message from the thrown error; no results → "No hotels found for these dates"; backend failure → a short message with a "Try again" link, never a stack. Include a "Test bookings in the LiteAPI sandbox" `sample-badge` like the flight pages.
- `/hotels/[hotelId]`: validate params as above (bad → back to `/hotels`), `fetchHotelRooms`; show the hotel header (name, stars, rating, address), description, up to 8 images, facilities; a rooms list: room name, board, "Free cancellation until <date>" or "Non-refundable", taxes not included note, price for the stay (and per-night approximation = price / nights shown as "about ₹X per night" with `Math.round`), and a "Reserve" link per room to `/hotels/<hotelId>/book?<stay query>&offerId=<offerId>`. A "Back to results" link to `/hotels?<stay query>`. No rooms → "No rooms are available for these dates" with the back link. Use the existing class names (`details-page page-width`, `details-title`, `itinerary-panel`, `panel-heading`, `price-line`, `button button-blue`, `back-link`, `empty-state`) and add only the new CSS needed (grid for cards, room row) in `globals.css`, responsive at 800 px and 540 px like the existing sections.
- Header: add a "Hotels" `nav-link` between "Flights" and "Destinations". Footer text in `site-header.tsx` says "No payments or bookings are available in this preview." — change it to say test bookings run in test mode for flights and hotels and no real tickets or rooms are booked.
- Hotel photo hosts vary, so use plain `<img>`; do not add `next/image` remote patterns.
- Accessibility: labelled controls, visible focus (existing styles), results are real links, headings in order.

**Verify and commit:** typecheck, tests, build (the build must list `/hotels` and `/hotels/[hotelId]`). Without a backend URL (`FLITEL_API_URL` empty) the pages must render a clear "Hotels are not available yet" state rather than throwing. Commit `feat(web): hotel search, results and hotel pages`.

---

### Task 5: Frontend guest details, card payment, return and confirmation pages

**Files:**
- Create: `flitel-b2c/src/components/hotel-payment.tsx`, `flitel-b2c/src/components/hotel-complete.tsx`
- Create: `flitel-b2c/src/app/hotels/[hotelId]/book/page.tsx`, `flitel-b2c/src/app/hotels/complete/page.tsx`, `flitel-b2c/src/app/hotel-bookings/[bookingId]/page.tsx`
- Modify: `flitel-b2c/src/app/globals.css` (only what is new)

**Interfaces:**
- Consumes (Tasks 3–4): `parseStayParams`, `buildStayQuery`, `fetchHotelRooms`, `fetchHotelBooking`, `guestSchema`, `fieldErrors`, storage helpers, `classifyHotelBooking`, `Prebook` type, the proxy routes, the `booking-field` / `price-panel` / `booking-problem` / `price-notice` styles from the flight booking form.

**Requirements:**
- `/hotels/[hotelId]/book` (server): validate the stay and `offerId` query params, load the hotel and rooms with `fetchHotelRooms`, find the room with that `offerId` (not found → "This room is no longer available" with a link back to the hotel page), and render a summary panel (hotel, room, dates, nights, guests, price, cancellation terms) beside the client `<HotelPayment>`.
- `HotelPayment` (client) steps: **guest → (terms changed) → pay**.
  1. *Guest*: a panel with first name, last name, email, phone (reuse `booking-field`, same validation messages and focus-first-error behaviour as `booking-form.tsx`), a "Continue to payment" button. On submit validate with `guestSchema`; then `POST /api/hotels/prebook { offerId }`.
  2. Prebook answer: `410 OFFER_UNAVAILABLE` or `404` → "This room is no longer available" with a link back to the hotel page; any other failure → a retry message without claiming anything was charged; success → if `priceDifferencePercent !== 0` or `cancellationChanged` or `boardChanged`: show the new total and the changes in a `price-notice` and require an "Accept and continue" click before the card form (the notice must state what changed: price before → after using the summary price, cancellation terms changed, board changed).
  3. *Pay*: create `attemptId = crypto.randomUUID()`; **before** mounting the card form, save the pending attempt (`savePendingHotelAttempt`) with the holder details, `prebookId`, `transactionId`, `expectedTotal`/`expectedCurrency` from the prebook price; load `https://payment-wrapper.liteapi.travel/dist/liteAPIPayment.js?v=a1` once (inject a `<script>`, resolve on load, reject with a customer-safe message on error); then `new window.LiteAPIPayment({ publicKey: "sandbox", secretKey, returnUrl: <origin>/hotels/complete?attempt=<attemptId>&pid=<prebookId>&tid=<transactionId>, targetElement: "#hotel-payment", appearance: { theme: "flat" }, options: { business: { name: "Flitel" } } }).handlePayment()`. Declare the `Window.LiteAPIPayment` type locally. Show the sandbox test-card hint ("Test mode: use card 4242 4242 4242 4242, any CVV, any future expiry"). Never log `secretKey`.
  4. Each press of "Continue to payment" creates a **new** prebook and a **new** attemptId; going back to edit details clears the old pending attempt.
- `/hotels/complete` renders `HotelComplete` (client; read `attempt`, `pid`, `tid` from `useSearchParams`, wrap in `Suspense` per the Next 16 docs): read the pending attempt. `undefined` → "We couldn't find this payment attempt" with a link to `/hotels` and no booking call. `{ state: "checking" }` → the checking panel. `{ state: "ready" }` → guard against double calls with a ref, show "Confirming your booking…", `POST /api/hotel-bookings` with `{ attemptId, prebookId, transactionId, expectedTotal, expectedCurrency, holder }`, and on **any** answer remove the holder details (`clearHotelAttempt`, or `markHotelAttemptChecking` for `checking`); then `classifyHotelBooking`: `confirmed` → `router.replace('/hotel-bookings/<bookingId>')`; `checking` → the "We're checking your booking" panel with the short reference (first 8 chars of `attemptId`, uppercase), no retry, no search link; `failed` → "We couldn't complete this booking" with the reference and the sentence that Flitel will arrange any refund if the card was charged, plus a link to `/hotels`. A network failure (no response) is `checking`. The URL params `pid`/`tid` must match the stored attempt's; a mismatch is "couldn't find this payment attempt".
- `/hotel-bookings/[bookingId]` (server): `fetchHotelBooking`; on error a clear page ("We couldn't load this booking", link to `/hotels`); otherwise "Your hotel booking is confirmed." with the "Test booking" badge, a details panel (hotel, check-in/out, nights, guest name and email), cancellation terms (`Free cancellation until …` / `Non-refundable`), a sidebar with the booking reference (`bookingId`, plus `hotelConfirmationCode` when present), total paid, the sandbox note, and "Search more hotels". Only show "confirmed" when `status === "CONFIRMED"`; any other status renders the status text instead of the success heading.
- Layout reuses the flight pages' structure (`details-page`, `details-layout`, `price-panel`) and styles; keep functions short and flat — split the guest form, the terms notice and the SDK mounting into small components or helpers if `hotel-payment.tsx` grows past ~200 lines.

**Verify and commit:** typecheck, all tests, build (must list the three new pages). Commit `feat(web): hotel guest details, card payment and confirmation`.

---

### Task 6: Verification and docs

**Files:**
- Modify: `docs/superpowers/specs/2026-10-12-hotel-booking-design.md` (status line only if needed), `flitel-b2c/README.md` (a short Hotels section)

- [ ] **Step 1:** `npm --prefix flitel-b2c-service test`, `npm --prefix flitel-b2c-service run typecheck`, `npm --prefix flitel-b2c-service run build`, `npm --prefix flitel-b2c test`, `npm --prefix flitel-b2c run typecheck`, `npm --prefix flitel-b2c run build` — all green and pristine.
- [ ] **Step 2:** If `LITEAPI_KEY` exists in `flitel-b2c-service/.env.local` (check the name only, never print the value), start both servers and walk the happy path with the sandbox test card: search Mumbai, open a hotel, reserve, pay, land on the confirmation; then reload the return URL (must not book twice); check the `booking_attempts` document has no guest details. If the key is missing, say so and skip.
- [ ] **Step 3:** Read the final diff for readability (nesting, function length), comments that restate code, and any guest data in logs, URLs or stored documents.
- [ ] **Step 4:** Update the PR description and push (controller does this).
