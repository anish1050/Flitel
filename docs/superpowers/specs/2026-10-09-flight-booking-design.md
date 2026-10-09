# Flitel flight booking (Duffel test mode)

## Brief

Let customers book a flight end to end inside Flitel: flight details → traveller details → review → confirmation. Duffel stays invisible; every screen uses Flitel branding. Bookings run in Duffel test mode only: no real tickets, no money taken. The supplier for live bookings is still undecided, so the payment form is deferred.

## Decisions

- Layout: one page for traveller details and review (option 1 of the explored layouts).
- Payment: Duffel test balance pays every order; no card form.
- Visual style: reuse the flight details page parts: back link, eyebrow, heading, `sample-badge`, bordered panels with `panel-heading`, the `price-panel` sidebar, `button-blue`.

## Screens

**Flight details (`/flights/[id]`)**: the preview note becomes a "Book this flight" button linking to `/flights/[id]/book` with the same search query.

**Book (`/flights/[id]/book`)**: two states on one page.

1. Edit: one panel per offer passenger (title, first name, last name, date of birth, gender) and one contact panel (email, phone). Passport number, issuing country and expiry appear only when the offer sets `passenger_identity_documents_required`. The price sidebar matches the details page. "Review and confirm" validates every field client-side, then rechecks the offer price.
2. Review: the same panels shown read-only, the complete latest total, an "Edit details" link back to state 1 (values kept), an "I have read the fare rules" checkbox, and "Confirm booking". The button stays disabled until the box is ticked and locks after one click.

**Confirmation (`/bookings/[orderId]`)**: heading "Your booking is confirmed.", flight timeline panel, travellers panel, contact email, and a sidebar with the booking reference, total paid, the test-booking note and "Plan another journey".

## Backend (flitel-b2c-service)

- Price recheck reuses `GET /api/flights/offers/:id` (already fetches the latest offer and rejects expired ones).
- `POST /api/bookings`: body `{ attemptId, offerId, expectedTotal, expectedCurrency, travellers[], contact }`, validated with zod, body limit 32 KB (outside the 4 KB `/api/flights/*` limit). `attemptId` is a UUID the book page creates for each confirm attempt; it creates a fresh one after any definite non-success response.
  1. Look up the attempt in MongoDB (`booking_attempts`, `_id` = `attemptId`). If it exists, return its recorded result instead of booking again: `confirmed` → the order id, `failed` → `422 BOOKING_FAILED`, `pending` or `unknown` → `202 { data: { status: "checking" } }`. If MongoDB is unavailable, refuse with `503` and book nothing.
  2. Fetch the offer again. If the total or currency string differs from what the customer saw, respond `409 PRICE_CHANGED`; nothing is recorded. Traveller ids must match the offer's passenger ids, and passports must be present when the offer requires them (`400` otherwise).
  3. Claim the attempt with status `pending` (insert; a duplicate-key race returns the recorded result as in step 1).
  4. Create a Duffel order (`type: "instant"`, `payments: [{ type: "balance", amount, currency }]`), using the amount and currency from the offer just fetched. Each passenger gets the offer's passenger id plus the shared contact email and phone.
  5. Record `confirmed` with the order id, `failed` when Duffel answered 4xx, or `unknown` when the call timed out, the connection dropped, Duffel answered 5xx or the response could not be read. Respond accordingly.
- `GET /api/bookings/:orderId`: validates `ord_` ids, reads the order from Duffel, and returns it.
- The frontend proxies these through Next route handlers. If the proxy itself cannot reach the backend while placing an order, it answers `202 checking`, never "failed".
- Traveller data is passed through to Duffel only. It is not logged, stored in MongoDB or placed in URLs. A `booking_attempts` record holds only `attemptId`, `offerId`, amount, currency, status, order id and timestamps.

## Payment safety

These rules apply in test mode now so the flow is already correct when real money is added.

1. The server sets the amount. The charge always uses the latest Duffel offer's `total_amount` and `total_currency`; the customer's expected total only detects price changes.
2. One checkout books at most once. The `attemptId` record and the locked button stop double clicks, refreshes and retries from creating a second order.
3. "Confirmed" is shown only after Duffel returns an order with a booking reference. On an unknown outcome the page says "We're checking your booking", never "failed", and offers no retry. The attempt stays `unknown` for manual reconciliation against Duffel.
4. The full total and fare rules are shown, and the fare-rules box must be ticked, before Confirm is enabled.
5. Money stays as the decimal strings and currency codes Duffel returns. No floating-point arithmetic is used on amounts.
6. Card data and traveller details never reach logs or MongoDB.
7. Live-mode order, once a supplier and payment provider are chosen: recheck the price → authorise the customer's card (with 3D Secure) → create the order → capture only after the ticket is confirmed → on any failure void the authorisation instead of refunding. Confirm the RBI auto-reversal timelines for failed card-not-present transactions before launch.

Sources: Duffel quick start (latest offer price before ordering; payment amount matches `total_amount`), Duffel card payments guide (3D Secure session must be `ready_for_payment`), Duffel hold-orders guide, Spotnana air ticketing lifecycle (authorise at booking, ticket later), RBI TAT circular for failed transactions.

## Refreshing an unavailable fare

Duffel offers lapse (about 30 minutes) and can become unavailable before that (`offer_no_longer_available`, e.g. the airline's inventory moved). Instead of sending the customer back to search, Flitel looks for the same flight again.

- Backend `POST /api/flights/offers/:id/refresh` with the search criteria as the body. It reads the original offer from Duffel (Duffel still returns lapsed offers), runs a fresh, uncached search, and returns the offer for the same flight: every segment's marketing carrier, flight number and departure time must match, the currency must match, and the id must differ. When several fares match, it picks the one with the same fare brand name (`slices[].fare_brand_name`), otherwise the cheapest. No match → `404 OFFER_UNAVAILABLE` "This flight is no longer available. Please search again."
- The book page refreshes when the offer cannot be loaded, when the review price check fails, and when Confirm answers `OFFER_UNAVAILABLE`. It swaps in the new offer (id, total, fare rules, passport requirement), maps the travellers onto the new offer's passenger ids in order, keeps everything typed, clears the fare-rules checkbox, uses a fresh attemptId and shows "This fare was refreshed: <old> → <new>. Please check the new total." If passports become required it returns to the edit step to collect them.
- A fare is refreshed automatically at most once per Confirm: if the refreshed offer is also unavailable, the customer sees "This flight is no longer available" with the search link.
- Duffel's `offer_no_longer_available` is described as "no longer available", never "expired".

## Errors

| Case | Response | Customer sees |
| --- | --- | --- |
| Invalid field | inline, before any request | Message next to the field |
| Offer expired or no longer available | `410 OFFER_UNAVAILABLE` | Fare refreshed for the same flight with the new total; only if that flight is gone: "This flight is no longer available" + search again |
| Price changed | `409 PRICE_CHANGED` | New total highlighted on review; confirm again |
| Duffel rejects passenger data | `422` with Duffel's field message | Message on review; details kept |
| Supplier down before ordering (offer fetch fails) | `502/503` | "Nothing was booked. Please try again." |
| Timeout or dropped connection while creating the order | `202 { data: { status: "checking" } }` | "We're checking your booking"; no retry button |
| Same `attemptId` submitted again | recorded result | Same confirmation or message as the first submit |

## Out of scope

Seats, bags and meals; confirmation emails; customer accounts and a "My bookings" list; real payment collection; live mode.

Known limit: anyone holding a confirmation URL can view that booking. That is acceptable for test bookings; it needs an access check before live mode.

## Verification

Vitest: traveller form validation, form-to-Duffel passenger mapping, and the orders endpoint (success, price changed, expired, invalid body, repeated `attemptId` returns the first result without a second Duffel call, timeout records `unknown`, amount sent to Duffel comes from the fetched offer and not the request). Typecheck and build both apps. In the browser: search → details → book → review → confirm → confirmation page, plus the price-changed and expired paths, on desktop and mobile.
