# Flitel hotel booking (LiteAPI sandbox)

## Brief

Customers search hotels, pick a room, enter guest details, pay by card and get a confirmation, all inside Flitel. LiteAPI (Nuitee) is the supplier because it is the closest match to the owner's requirements: a free self-serve sandbox, an embedded payment form where the **customer's** card pays, no booking fees, and the agency margin paid out later. It runs against the LiteAPI **sandbox only**; no live bookings. Spec for the flight flow: `2026-10-09-flight-booking-design.md` (same safety philosophy).

## Decisions (owner approved the recommended options)

- Hotels are a separate section: `/hotels` search → results → hotel page with rooms → guest details and payment → confirmation. Attaching hotels to a flight booking is a later change.
- One room, adult guests only (1–9). Currency `INR`, guest nationality `IN` (constants, changeable once the key shows what the sandbox supports).
- The customer pays through LiteAPI's Payment SDK form, embedded in Flitel's page. Card details go from the browser to LiteAPI's form and never reach Flitel's servers.
- Reuse the flight booking building blocks: `booking_attempts` collection and its claim/record helpers, `readJsonBody`, the proxy-route pattern, the booking form styles (`details-page`, `itinerary-panel`, `price-panel`, `booking-field`, …).

## Flow

1. **Search** (`GET /hotels?city=…&checkin=…&checkout=…&adults=…`): server-rendered results grid (photo, name, stars, rating, "from" price, free-cancellation tag).
2. **Hotel page** (`/hotels/[hotelId]?…`): description, photos, facilities, and the available rooms (name, board, price for the stay, refundable or not, cancellation deadline, taxes not included).
3. **Guest details + payment** (`/hotels/[hotelId]/book?offerId=…&…`): the lead guest's name, email and phone; "Continue to payment" asks the backend to prebook the offer. If the price, cancellation terms or board changed, the page shows the new terms and the customer must confirm them before the card form is shown. The LiteAPI card form then appears on the page; the customer pays.
4. **Return** (`/hotels/complete?pid=…&tid=…&attempt=…`): LiteAPI redirects here after payment. The page sends the booking request and shows "Confirming your booking…", then redirects to the confirmation.
5. **Confirmation** (`/hotel-bookings/[bookingId]`): booking reference, hotel, dates, guest, total, cancellation terms, "Test booking" label.

## Backend (flitel-b2c-service)

All under the existing CORS rules; bodies are JSON with the usual `{ "error": { "code", "message" } }` envelope on failure. The LiteAPI key is `LITEAPI_KEY` (server-side only).

| Endpoint | Purpose |
| --- | --- |
| `POST /api/hotels/search` | `{ countryCode, cityName, checkin, checkout, adults, currency, guestNationality }` → `{ data: { hotels: [{ id, name, photo, address, stars, rating, price: { amount, currency }, refundable }] } }`, cheapest rate per hotel, fresh each time (no cache). Calls `POST https://api.liteapi.travel/v3.0/hotels/rates` with `includeHotelData: true`. |
| `POST /api/hotels/:hotelId/rates` | Same stay fields → `{ data: { hotel: { id, name, photo, address, stars, rating, description?, images?, facilities? }, rooms: [{ offerId, name, boardName, refundable, cancelBefore?, price: { amount, currency }, taxesNotIncluded: [{ description, amount, currency }] }] } }`. Rates with `hotelIds: [hotelId]`; hotel details from `GET /data/hotel?hotelId=` with a short timeout, omitted if it fails. |
| `POST /api/hotels/prebook` | `{ offerId }` → `{ data: { prebookId, transactionId, secretKey, hotelId, checkin, checkout, price: { amount, currency }, priceDifferencePercent, cancellationChanged, boardChanged, refundable } }`. Calls `POST https://book.liteapi.travel/v3.0/rates/prebook` with `usePaymentSdk: true`. |
| `POST /api/hotel-bookings` | `{ attemptId, prebookId, transactionId, expectedTotal, expectedCurrency, holder: { firstName, lastName, email, phone } }` → `200 { data: { bookingId } }`, `202 { data: { status: "checking" } }`, or an error. The once-only booking described below. |
| `GET /api/hotel-bookings/:bookingId?ref=<attemptId>` | `GET https://book.liteapi.travel/v3.0/bookings/{id}`; the booking is returned only when its `clientReference` equals `ref` (the unguessable attempt UUID that created it), otherwise `404 BOOKING_NOT_FOUND`, so a booking id alone never reveals guest details → `{ data: { bookingId, status, hotel: { id, name }, checkin, checkout, holder: { firstName, lastName, email }, price, currency, cancellation: { refundableTag, cancelPolicyInfos }, hotelConfirmationCode? } }` (no phone). |

The prebook response's `prebookId` and `transactionId` must match the booking schema's patterns, otherwise prebook answers `502` before the card form is shown. After payment, no booking answer says "nothing was booked", because the card has already been charged.

Limits: search/rates bodies 4 KB, booking body 8 KB (the existing `/api/flights/*` limit does not cover `/api/hotels/*`).

### `POST /api/hotel-bookings` steps

1. Validate the body (zod). `attemptId` is a UUID created for each payment attempt.
2. Look up the attempt in `booking_attempts`. The key is `_id` = `hotel:<prebookId>`, not the client's attemptId: one prebook is one payment, so a second tab or a second attemptId for the same prebook replays the first result instead of booking again; if it exists, replay its result: `confirmed` → bookingId, `failed` → `422 BOOKING_FAILED`, `pending`/`unknown` → `202 checking`. MongoDB unavailable → `503 BOOKINGS_UNAVAILABLE`, nothing booked.
3. Claim the attempt (`status: pending`, `_id` as above, `offerId` field holds the prebookId, amount and currency are the client's expected values and informational only; `clientReference` stores the attemptId for manual reconciliation, it is not personal data). A duplicate-key race replays as in step 2.
4. `POST https://book.liteapi.travel/v3.0/rates/book` with `prebookId`, `holder`, one guest (`occupancyNumber: 1`, the holder's name and email), `payment: { method: "TRANSACTION_ID", transactionId }` and `clientReference: attemptId` (LiteAPI treats a repeated clientReference as a duplicate, error 4005, so even a lost record cannot book twice).
5. Record and answer:
   - `200` with `status: CONFIRMED` and a `bookingId` → `confirmed`.
   - `400` with code 4000, 4002, 4003 or 4010 (the request was invalid, no booking) → `failed`, `422 BOOKING_REJECTED`.
   - HTTP `410`, or HTTP `400` with code 4012 or 2013 (room no longer available) → `failed`, `410 ROOM_UNAVAILABLE`. Only those exact statuses count: a 2xx or 5xx carrying such a code is `unknown`.
   - `401` or `403` → `failed`, `503 HOTELS_UNAVAILABLE`.
   - Everything else, including timeouts, 5xx, an unreadable body, codes 2014, 4005, 5000 and a `200` that is not `CONFIRMED` → `unknown`, `202 checking`.

## Payment safety

1. **The browser never sets the amount.** The price charged is fixed by LiteAPI at prebook and bound to the card form's `secretKey`. The prebook response's `priceDifferencePercent`, `cancellationChanged` and `boardChanged` are shown to the customer, who must accept them before the card form appears.
2. **One payment attempt books at most once.** `attemptId` (claimed in MongoDB) plus LiteAPI's `clientReference`. A new `attemptId` and a new prebook are created for every new payment attempt, because LiteAPI issues a new `transactionId` for each prebook.
3. **Unknown is never "failed".** The SDK charges the card before the book call, so any outcome that is not proven (`confirmed`, or an explicit room-unavailable or invalid-request rejection) shows "We're checking your booking" with the reference and a "Check again" button that re-sends the same booking request. Re-sending is safe: the backend claim is once-only per prebook, so it either replays the recorded result or completes a booking that never reached the server. The guest details therefore stay in the tab's sessionStorage until a confirmed or failed answer arrives; an unclear answer, an unreachable backend or a reload never drops them, and a reload that finds them sends the request again.
4. **Say what happens to the money.** On `ROOM_UNAVAILABLE` after payment the page says the booking could not be completed and that Flitel will arrange any refund, quoting the reference. This is a commitment, and is an open question for LiteAPI below.
5. **Guest details never go in URLs, logs or MongoDB.** They live in the browser tab (sessionStorage) only while the customer is on the card form, its redirect and the booking call, and are removed once a confirmed or failed answer arrives.
6. **Sandbox only.** `search` and `rates` refuse a response whose `sandbox` flag is not `true`; the SDK runs with `publicKey: "sandbox"`.
7. **Card data never reaches Flitel.** The SDK's form handles it.

## Errors

| Case | Response | Customer sees |
| --- | --- | --- |
| Invalid search or guest details | `400` | Inline field messages |
| No hotels found | `200` with an empty list | "No hotels found for these dates" |
| Offer gone at prebook (`4040` outdated offer) | `410 OFFER_UNAVAILABLE` | "This room is no longer available" + back to the hotel's rooms |
| Price, cancellation or board changed at prebook | `200` with the change flags | The new terms, re-confirmed before payment |
| Room unavailable after payment | `410 ROOM_UNAVAILABLE` | Booking could not be completed; reference; Flitel will arrange any refund |
| Timeout or unclear result | `202 checking` | "We're checking your booking"; "Check again" re-sends the same request |
| Supplier down | `502/503` | "Hotels are unavailable right now. Nothing was booked." |
| No `LITEAPI_KEY` | `503 LITEAPI_NOT_CONFIGURED` | "Hotel booking isn't available yet." |

## Not included

Multiple rooms, children, hotel maps, filters and sorting beyond price order, saved guests, accounts, a "My bookings" list, cancellations, confirmation emails, loyalty, live mode. Hotel availability depends on the sandbox's content, which is limited.

## Open questions for LiteAPI (to add to the supplier emails)

1. Is a card on the account still required for a production key when every booking is paid through the Payment SDK? Will it ever be charged?
2. If the SDK charge succeeds but `rates/book` fails, is the customer's payment voided or refunded automatically, and how fast?
3. Which merchant name appears on the customer's card statement; can it be "Flitel"?
4. Can the SDK charge Indian cards in INR (including RuPay and UPI), and are payouts to an Indian bank account in INR supported?
5. How many Indian hotels are available, and what is the default commission?
6. If a customer pays through the SDK but never returns to Flitel, so no book call is made, is that transaction voided automatically, and after how long?

## Verification

Vitest for the backend (search/rates normalisation, sandbox refusal, prebook, once-only booking including replay, unknown on timeout, rejection mapping, booking read-back) and the frontend libraries (stay query validation, guest schema, storage helpers, response classification). Typecheck and build both apps. With a sandbox key: search a city, open a hotel, reserve, pay with the sandbox test card (`4242 4242 4242 4242`, any CVV, any future expiry), and check the confirmation page, the replayed attempt, and the stored attempt record.
