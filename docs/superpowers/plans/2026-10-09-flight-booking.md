# Flight Booking (Duffel Test Mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers book a Duffel test-mode flight inside Flitel: flight details → traveller details → review → confirmation. The flow cannot double-book and never charges an amount the browser chose.

**Architecture:** The Hono backend (`flitel-b2c-service`) gets `POST /api/bookings` and `GET /api/bookings/:orderId`. A `booking_attempts` MongoDB collection makes each confirm attempt book at most once. The Next.js app (`flitel-b2c`) gets a one-page booking form at `/flights/[id]/book`, a confirmation page at `/bookings/[orderId]` and two proxy route handlers. The browser never talks to the backend directly.

**Tech Stack:** Node 24, TypeScript, Hono 4, zod 4, MongoDB driver 7, Vitest 4, Next.js 16 (App Router), React 19, lucide-react, plain CSS in `globals.css`.

**Spec:** `docs/superpowers/specs/2026-10-09-flight-booking-design.md`

## Global Constraints

- Duffel test mode only. Tokens must match `duffel_test_...`, and supplier objects must have `live_mode: false`.
- Payment is `type: "balance"`. The amount and currency always come from the offer the server has just fetched, never from the request.
- Amounts stay as Duffel's decimal strings and are compared as strings. `Number(...)` is allowed only for display through `formatPrice`.
- Traveller details (names, birth dates, passports, email, phone) never go into logs, MongoDB, URLs or Duffel `metadata`.
- A `booking_attempts` document holds only `_id` (attemptId), `offerId`, `amount`, `currency`, `status`, `orderId?`, `createdAt` and `updatedAt`.
- Only show "Confirmed" after Duffel returns an order with a booking reference. An unknown outcome shows "We're checking your booking" and offers no retry.
- Errors use `{ "error": { "code": "...", "message": "..." } }`, as the existing API does.
- `flitel-b2c/AGENTS.md`: Next 16 differs from older versions. Before writing a page or route handler, read the relevant guide in `flitel-b2c/node_modules/next/dist/docs/`.
- The project is **not** a git repository, so there are no commit steps. Each task ends with its tests passing.
- Match the surrounding code: no new dependencies, comments only for a non-obvious reason, names like the existing `requestDuffel` and `parseDuffelOffer`.

## File map

Backend `flitel-b2c-service/src/`:
- Create `orders.ts`: booking request schema, Duffel order body builder, traveller and offer checks, order id and order response schemas.
- Create `orders.test.ts`: pure tests for `orders.ts`.
- Create `booking-attempts.ts`: find, claim and record attempts in `booking_attempts`.
- Modify `duffel.ts`: extract `duffelHeaders`, add `placeDuffelOrder`, which reports created, rejected or unknown.
- Modify `index.ts`: extract `fetchCurrentOffer`, add the booking routes and the 32 KB body limit.
- Create `bookings.test.ts`: route tests with in-memory MongoDB and mocked Duffel.
- Modify `../README.md`: document the endpoints.

Frontend `flitel-b2c/src/`:
- Modify `lib/duffel-offers.ts`: export the shared schemas, add `totalAmount` and `identityDocumentsRequired`.
- Modify `lib/flights.ts`: two optional fields on `FlightOffer`.
- Create `lib/duffel-orders.ts` and `lib/duffel-orders.test.ts`: parse a Duffel order for the confirmation page.
- Create `lib/booking.ts` and `lib/booking.test.ts`: form input type, validation schema, field errors.
- Create `lib/request-body.ts`: size-limited JSON body reader, shared by both proxy routes.
- Modify `app/api/flights/search/route.ts`: use `readJsonBody`.
- Modify `lib/flight-api.ts` and `lib/flight-api.test.ts`: `backendUrl`, `fetchSupplierOffer`, `createBooking`, `fetchBooking`.
- Create `app/api/bookings/route.ts` and `app/api/bookings/route.test.ts`: booking proxy.
- Create `app/api/flights/offers/[id]/route.ts`: latest price for the review step.
- Create `components/booking-panels.tsx`: presentational panels (traveller fields, contact fields, review, checking).
- Create `components/booking-form.tsx`: client state machine plus the price sidebar.
- Create `app/flights/[id]/book/page.tsx`: the book page.
- Modify `app/flights/[id]/page.tsx`: the Book this flight button.
- Create `app/bookings/[orderId]/page.tsx`: the confirmation page.
- Modify `app/globals.css`: form, review and confirmation styles.

---

### Task 1: Backend booking schema and Duffel order body

**Files:**
- Create: `flitel-b2c-service/src/orders.ts`
- Test: `flitel-b2c-service/src/orders.test.ts`

**Interfaces:**
- Consumes: `offerId` (zod) and `FlightOffer` type from `./flights.js`.
- Produces: `bookingRequestSchema`, `type BookingRequest`, `orderId` (zod), `duffelOrderSchema`, `findTravellerMismatch(request: BookingRequest, offer: FlightOffer): string | undefined`, `buildDuffelOrder(request: BookingRequest, offer: FlightOffer)`.

- [ ] **Step 1: Write the failing test**

`flitel-b2c-service/src/orders.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bookingRequestSchema,
  buildDuffelOrder,
  findTravellerMismatch,
} from "./orders.js";
import type { FlightOffer } from "./flights.js";

const offer = {
  id: "off_example_123",
  live_mode: false,
  expires_at: "2026-09-30T12:30:00Z",
  total_amount: "550.25",
  total_currency: "GBP",
  slices: [{ id: "sli_outbound" }],
  passengers: [{ id: "pas_one", type: "adult" }],
} as FlightOffer;
const traveller = {
  id: "pas_one",
  title: "ms",
  givenName: "Priya",
  familyName: "Sharma",
  bornOn: "1990-04-12",
  gender: "f",
};
const request = {
  attemptId: "3b241101-e2bb-4255-8caf-4136c566a962",
  offerId: "off_example_123",
  expectedTotal: "550.25",
  expectedCurrency: "GBP",
  travellers: [traveller],
  contact: { email: "priya@example.com", phone: "+919876543210" },
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("booking request", () => {
  it("accepts complete traveller and contact details", () => {
    expect(bookingRequestSchema.safeParse(request).success).toBe(true);
  });

  it("rejects incomplete or malformed details", () => {
    for (const changes of [
      { attemptId: "not-a-uuid" },
      { expectedTotal: "5.5.5" },
      { expectedCurrency: "gbp" },
      { travellers: [] },
      { travellers: [{ ...traveller, givenName: "" }] },
      { travellers: [{ ...traveller, givenName: "Pr1ya" }] },
      { travellers: [{ ...traveller, title: "sir" }] },
      { travellers: [{ ...traveller, gender: "x" }] },
      { travellers: [{ ...traveller, bornOn: "2026-10-01" }] },
      {
        travellers: [
          { ...traveller, passport: { number: "ab 12", issuingCountry: "IN", expiresOn: "2030-01-01" } },
        ],
      },
      { contact: { email: "not-an-email", phone: "+919876543210" } },
      { contact: { email: "priya@example.com", phone: "9876543210" } },
    ]) {
      expect(
        bookingRequestSchema.safeParse({ ...request, ...changes }).success,
      ).toBe(false);
    }
  });
});

describe("Duffel order body", () => {
  it("pays the offer's own amount and maps every traveller", () => {
    const parsed = bookingRequestSchema.parse({
      ...request,
      travellers: [
        {
          ...traveller,
          passport: { number: "Z1234567", issuingCountry: "IN", expiresOn: "2031-05-01" },
        },
      ],
    });
    expect(
      buildDuffelOrder(parsed, { ...offer, total_amount: "600.00" }),
    ).toEqual({
      type: "instant",
      selected_offers: ["off_example_123"],
      payments: [{ type: "balance", amount: "600.00", currency: "GBP" }],
      passengers: [
        {
          id: "pas_one",
          title: "ms",
          gender: "f",
          given_name: "Priya",
          family_name: "Sharma",
          born_on: "1990-04-12",
          email: "priya@example.com",
          phone_number: "+919876543210",
          identity_documents: [
            {
              type: "passport",
              unique_identifier: "Z1234567",
              issuing_country_code: "IN",
              expires_on: "2031-05-01",
            },
          ],
        },
      ],
    });
  });

  it("requires travellers to match the fare and passports when the airline asks", () => {
    const parsed = bookingRequestSchema.parse(request);
    expect(findTravellerMismatch(parsed, offer)).toBeUndefined();
    expect(
      findTravellerMismatch(parsed, {
        ...offer,
        passengers: [{ id: "pas_other" }],
      }),
    ).toBe("Traveller details do not match this fare.");
    expect(
      findTravellerMismatch(parsed, {
        ...offer,
        passenger_identity_documents_required: true,
      }),
    ).toBe("Passport details are required for this flight.");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix flitel-b2c-service test -- src/orders.test.ts`
Expected: FAIL, because `./orders.js` cannot be resolved.

- [ ] **Step 3: Write the implementation**

`flitel-b2c-service/src/orders.ts`:

```ts
import { z } from "zod";
import { offerId } from "./flights.js";
import type { FlightOffer } from "./flights.js";

const nameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z' -]{0,49}$/, "Use English letters as shown on the passport.");
const dateSchema = z.iso.date("Use a valid date.");

const travellerSchema = z.object({
  id: z.string().regex(/^pas_[A-Za-z0-9_]{1,128}$/),
  title: z.enum(["mr", "ms", "mrs", "miss"]),
  givenName: nameSchema,
  familyName: nameSchema,
  bornOn: dateSchema.refine(
    (date) => date < new Date().toISOString().slice(0, 10),
    "Date of birth must be in the past.",
  ),
  gender: z.enum(["m", "f"]),
  passport: z
    .object({
      number: z.string().regex(/^[A-Z0-9]{5,20}$/),
      issuingCountry: z.string().regex(/^[A-Z]{2}$/),
      expiresOn: dateSchema,
    })
    .optional(),
});

export const bookingRequestSchema = z.object({
  attemptId: z.uuid(),
  offerId,
  expectedTotal: z.string().regex(/^\d+(\.\d+)?$/),
  expectedCurrency: z.string().regex(/^[A-Z]{3}$/),
  travellers: z.array(travellerSchema).min(1).max(9),
  contact: z.object({
    email: z.email().max(254),
    phone: z.string().regex(/^\+[1-9]\d{6,14}$/),
  }),
});
export type BookingRequest = z.infer<typeof bookingRequestSchema>;

export const orderId = z.string().regex(/^ord_[A-Za-z0-9]{1,128}$/);
export const duffelOrderSchema = z.looseObject({
  id: orderId,
  live_mode: z.literal(false),
  booking_reference: z.string().min(1),
});

export function findTravellerMismatch(
  request: BookingRequest,
  offer: FlightOffer,
): string | undefined {
  const fareIds = offer.passengers.map((passenger) => String(passenger.id)).sort();
  const travellerIds = request.travellers.map((traveller) => traveller.id).sort();
  if (fareIds.join() !== travellerIds.join())
    return "Traveller details do not match this fare.";
  if (
    offer.passenger_identity_documents_required === true &&
    request.travellers.some((traveller) => !traveller.passport)
  )
    return "Passport details are required for this flight.";
  return undefined;
}

export function buildDuffelOrder(request: BookingRequest, offer: FlightOffer) {
  return {
    type: "instant",
    selected_offers: [offer.id],
    payments: [
      { type: "balance", amount: offer.total_amount, currency: offer.total_currency },
    ],
    passengers: request.travellers.map((traveller) => ({
      id: traveller.id,
      title: traveller.title,
      gender: traveller.gender,
      given_name: traveller.givenName,
      family_name: traveller.familyName,
      born_on: traveller.bornOn,
      email: request.contact.email,
      phone_number: request.contact.phone,
      ...(traveller.passport && {
        identity_documents: [
          {
            type: "passport",
            unique_identifier: traveller.passport.number,
            issuing_country_code: traveller.passport.issuingCountry,
            expires_on: traveller.passport.expiresOn,
          },
        ],
      }),
    })),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix flitel-b2c-service test -- src/orders.test.ts`
Expected: PASS (4 tests).

---

### Task 2: Backend `POST /api/bookings` with once-only booking attempts

**Files:**
- Create: `flitel-b2c-service/src/booking-attempts.ts`
- Modify: `flitel-b2c-service/src/duffel.ts` (headers in `requestDuffel`, new `placeDuffelOrder`)
- Modify: `flitel-b2c-service/src/index.ts` (extract `fetchCurrentOffer`, add the route)
- Test: `flitel-b2c-service/src/bookings.test.ts`

**Interfaces:**
- Consumes (Task 1): `bookingRequestSchema`, `buildDuffelOrder`, `findTravellerMismatch`, `duffelOrderSchema`.
- Produces: the HTTP contract `POST /api/bookings`:
  - `200 { data: { orderId } }`
  - `202 { data: { status: "checking" } }`
  - `400 INVALID_BOOKING`
  - `409 PRICE_CHANGED`
  - `410 OFFER_UNAVAILABLE`
  - `422 BOOKING_REJECTED | BOOKING_FAILED`
  - `503 BOOKINGS_UNAVAILABLE | DUFFEL_NOT_CONFIGURED`
  - `413 REQUEST_TOO_LARGE`

  It also produces `placeDuffelOrder(body: unknown, token: string): Promise<DuffelOrderResult>`.

- [ ] **Step 1: Write the failing tests**

`flitel-b2c-service/src/bookings.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "./index.js";

const { attempts, mongo } = vi.hoisted(() => ({
  attempts: new Map<string, Record<string, unknown>>(),
  mongo: { down: false },
}));
vi.mock("./mongodb.js", async () => {
  const { MongoServerError } = await import("mongodb");
  const ensureUp = () => {
    if (mongo.down) throw new Error("mongodb://user:secret@host unavailable");
  };
  return {
    getDatabase: () => ({
      collection: () => ({
        findOne: async ({ _id }: { _id: string }) => {
          ensureUp();
          return attempts.get(_id) ?? null;
        },
        insertOne: async (document: { _id: string }) => {
          ensureUp();
          if (attempts.has(document._id))
            throw new MongoServerError({ message: "duplicate key", code: 11000 });
          attempts.set(document._id, { ...document });
          return { acknowledged: true };
        },
        updateOne: async (
          { _id }: { _id: string },
          update: { $set: Record<string, unknown> },
        ) => {
          ensureUp();
          Object.assign(attempts.get(_id)!, update.$set);
          return { acknowledged: true };
        },
      }),
    }),
  };
});

const offer = {
  id: "off_example_123",
  live_mode: false,
  expires_at: "2026-09-30T12:30:00Z",
  total_amount: "550.25",
  total_currency: "GBP",
  slices: [{ id: "sli_outbound" }],
  passengers: [{ id: "pas_one", type: "adult" }],
};
const order = {
  id: "ord_example123",
  live_mode: false,
  booking_reference: "K7XQ2M",
};
const traveller = {
  id: "pas_one",
  title: "ms",
  givenName: "Priya",
  familyName: "Sharma",
  bornOn: "1990-04-12",
  gender: "f",
};
const booking = (changes: Record<string, unknown> = {}) => ({
  attemptId: crypto.randomUUID(),
  offerId: offer.id,
  expectedTotal: "550.25",
  expectedCurrency: "GBP",
  travellers: [traveller],
  contact: { email: "priya@example.com", phone: "+919876543210" },
  ...changes,
});

type DuffelReply = () => Response | Promise<Response>;
const fetchMock = vi.fn<typeof fetch>();
function duffelReplies(
  replies: Partial<Record<"offer" | "order" | "getOrder", DuffelReply>> = {},
) {
  const {
    offer: offerReply = () => Response.json({ data: offer }),
    order: orderReply = () => Response.json({ data: order }, { status: 201 }),
    getOrder = () => Response.json({ data: order }),
  } = replies;
  fetchMock.mockImplementation(async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path.startsWith("/air/offers/")) return offerReply();
    if (path === "/air/orders" && init?.method === "POST") return orderReply();
    if (path.startsWith("/air/orders/")) return getOrder();
    throw new Error(`Unexpected Duffel call ${path}`);
  });
}
const orderCalls = () =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      String(input).endsWith("/air/orders") && init?.method === "POST",
  );
function placeBooking(body: unknown) {
  return app.request("/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  attempts.clear();
  mongo.down = false;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
  vi.stubEnv("DUFFEL_ACCESS_TOKEN", "duffel_test_example");
  vi.stubGlobal("fetch", fetchMock.mockReset());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("booking API", () => {
  it("books once with the supplier's amount and replays the result for the same attempt", async () => {
    duffelReplies();
    const request = booking();
    const first = await placeBooking(request);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ data: { orderId: "ord_example123" } });
    expect(JSON.parse(String(orderCalls()[0][1]!.body)).data).toEqual({
      type: "instant",
      selected_offers: ["off_example_123"],
      payments: [{ type: "balance", amount: "550.25", currency: "GBP" }],
      passengers: [
        {
          id: "pas_one",
          title: "ms",
          gender: "f",
          given_name: "Priya",
          family_name: "Sharma",
          born_on: "1990-04-12",
          email: "priya@example.com",
          phone_number: "+919876543210",
        },
      ],
    });

    const repeat = await placeBooking(request);
    expect(await repeat.json()).toEqual({ data: { orderId: "ord_example123" } });
    expect(orderCalls()).toHaveLength(1);
    expect(attempts.get(request.attemptId)).toMatchObject({
      status: "confirmed",
      orderId: "ord_example123",
      offerId: "off_example_123",
      amount: "550.25",
      currency: "GBP",
    });
    expect(JSON.stringify([...attempts.values()])).not.toMatch(
      /Priya|Sharma|example\.com|9876543210/,
    );
  });

  it("refuses a changed price without ordering or recording anything", async () => {
    duffelReplies();
    const response = await placeBooking(booking({ expectedTotal: "500.00" }));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("PRICE_CHANGED");
    expect(orderCalls()).toHaveLength(0);
    expect(attempts.size).toBe(0);
  });

  it("rejects expired offers and invalid bookings before ordering", async () => {
    duffelReplies({
      offer: () =>
        Response.json({ data: { ...offer, expires_at: "2026-09-30T11:00:00Z" } }),
    });
    expect((await placeBooking(booking())).status).toBe(410);

    duffelReplies();
    for (const changes of [
      { travellers: [] },
      { attemptId: "1" },
      { contact: { email: "x", phone: "123" } },
    ]) {
      expect((await placeBooking(booking(changes))).status).toBe(400);
    }
    const mismatch = await placeBooking(
      booking({ travellers: [{ ...traveller, id: "pas_other" }] }),
    );
    expect(mismatch.status).toBe(400);
    expect((await mismatch.json()).error.message).toBe(
      "Traveller details do not match this fare.",
    );

    duffelReplies({
      offer: () =>
        Response.json({
          data: { ...offer, passenger_identity_documents_required: true },
        }),
    });
    expect((await placeBooking(booking())).status).toBe(400);

    const oversized = await placeBooking({
      ...booking(),
      padding: "x".repeat(33 * 1024),
    });
    expect(oversized.status).toBe(413);
    expect(orderCalls()).toHaveLength(0);
    expect(attempts.size).toBe(0);
  });

  it("reports an unknown outcome on timeout or supplier errors and never orders twice", async () => {
    for (const orderReply of [
      () => Promise.reject(new DOMException("timed out", "TimeoutError")),
      () => new Response("upstream failure", { status: 500 }),
      () => new Response("not json", { status: 201 }),
    ]) {
      fetchMock.mockReset();
      duffelReplies({ order: orderReply });
      const request = booking();
      const response = await placeBooking(request);
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ data: { status: "checking" } });
      expect(attempts.get(request.attemptId)?.status).toBe("unknown");

      const repeat = await placeBooking(request);
      expect(repeat.status).toBe(202);
      expect(orderCalls()).toHaveLength(1);
    }
  });

  it("records supplier rejections and replays them for the same attempt", async () => {
    duffelReplies({
      order: () =>
        Response.json(
          { errors: [{ code: "validation_error", message: "Phone number is invalid" }] },
          { status: 422 },
        ),
    });
    const request = booking();
    const response = await placeBooking(request);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: { code: "BOOKING_REJECTED", message: "Phone number is invalid" },
    });
    expect(attempts.get(request.attemptId)?.status).toBe("failed");
    const repeat = await placeBooking(request);
    expect((await repeat.json()).error.code).toBe("BOOKING_FAILED");
    expect(orderCalls()).toHaveLength(1);

    duffelReplies({
      order: () =>
        Response.json(
          { errors: [{ code: "offer_no_longer_available", message: "Gone" }] },
          { status: 422 },
        ),
    });
    expect((await placeBooking(booking())).status).toBe(410);
  });

  it("books nothing while the database is unavailable", async () => {
    duffelReplies();
    mongo.down = true;
    const response = await placeBooking(booking());
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text).error.code).toBe("BOOKINGS_UNAVAILABLE");
    expect(text).not.toContain("secret");
    expect(orderCalls()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix flitel-b2c-service test -- src/bookings.test.ts`
Expected: FAIL, with 404 `NOT_FOUND` responses where 200, 409 and so on are expected.

- [ ] **Step 3: Add `placeDuffelOrder` to `duffel.ts`**

Replace the inline `headers` object in `requestDuffel` with `headers: duffelHeaders(token),` and add this above `requestDuffel`:

```ts
function duffelHeaders(token: string) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "Duffel-Version": "v2",
    Authorization: `Bearer ${token}`,
  };
}
```

Append to `duffel.ts`:

```ts
export type DuffelOrderResult =
  | { outcome: "created"; order: unknown }
  | { outcome: "rejected"; codes: string[]; message?: string }
  | { outcome: "unknown" };

const duffelErrorsSchema = z.object({
  errors: z.array(
    z.object({ code: z.string().optional(), message: z.string().optional() }),
  ),
});

// Only a 4xx proves Duffel did not create the order; anything else might have booked seats.
export async function placeDuffelOrder(
  body: unknown,
  token: string,
): Promise<DuffelOrderResult> {
  let response: Response;
  try {
    response = await fetch("https://api.duffel.com/air/orders", {
      method: "POST",
      headers: duffelHeaders(token),
      body: JSON.stringify({ data: body }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return { outcome: "unknown" };
  }
  if (response.status >= 500) {
    await response.body?.cancel();
    return { outcome: "unknown" };
  }
  const json: unknown = await response.json().catch(() => undefined);
  if (response.ok) {
    const envelope = z.object({ data: z.unknown() }).safeParse(json);
    return envelope.success
      ? { outcome: "created", order: envelope.data.data }
      : { outcome: "unknown" };
  }
  const errors = duffelErrorsSchema.safeParse(json);
  return {
    outcome: "rejected",
    codes: errors.success
      ? errors.data.errors.flatMap((error) => (error.code ? [error.code] : []))
      : [],
    message: errors.success
      ? errors.data.errors.find((error) => error.message)?.message
      : undefined,
  };
}
```

- [ ] **Step 4: Create `booking-attempts.ts`**

```ts
import { MongoServerError } from "mongodb";
import { getDatabase } from "./mongodb.js";

export type BookingStatus = "pending" | "confirmed" | "failed" | "unknown";
export type BookingAttempt = {
  _id: string;
  offerId: string;
  amount: string;
  currency: string;
  status: BookingStatus;
  orderId?: string;
  createdAt: Date;
  updatedAt: Date;
};
type NewAttempt = Pick<BookingAttempt, "_id" | "offerId" | "amount" | "currency">;

function bookingAttempts() {
  return getDatabase().collection<BookingAttempt>("booking_attempts");
}

export function findBookingAttempt(id: string): Promise<BookingAttempt | null> {
  return bookingAttempts().findOne({ _id: id });
}

/** Returns undefined when this call owns the attempt, or the attempt another request already claimed. */
export async function claimBookingAttempt(
  attempt: NewAttempt,
): Promise<BookingAttempt | undefined> {
  const now = new Date();
  const pending: BookingAttempt = {
    ...attempt,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  try {
    await bookingAttempts().insertOne(pending);
    return undefined;
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
    return (await findBookingAttempt(attempt._id)) ?? pending;
  }
}

export async function recordBookingOutcome(
  id: string,
  status: Exclude<BookingStatus, "pending">,
  orderId?: string,
): Promise<void> {
  await bookingAttempts().updateOne(
    { _id: id },
    { $set: { status, updatedAt: new Date(), ...(orderId && { orderId }) } },
  );
}
```

- [ ] **Step 5: Add the route to `index.ts`**

Add these imports:

```ts
import type { Context } from "hono";
import {
  bookingRequestSchema,
  buildDuffelOrder,
  duffelOrderSchema,
  findTravellerMismatch,
} from "./orders.js";
import {
  claimBookingAttempt,
  findBookingAttempt,
  recordBookingOutcome,
} from "./booking-attempts.js";
import type { BookingAttempt } from "./booking-attempts.js";
```

Add `placeDuffelOrder` to the existing `./duffel.js` import. Add `FlightOffer` as a type import from `./flights.js`.

After the existing `/api/flights/*` body limit:

```ts
app.use(
  "/api/bookings",
  bodyLimit({
    maxSize: 32 * 1024,
    onError: () =>
      raiseApiError(413, "REQUEST_TOO_LARGE", "The request body is too large."),
  }),
);
```

Extract the body of the existing `GET /api/flights/offers/:id` handler into a function (placed before the routes) and make that handler `return context.json({ data: await fetchCurrentOffer(parsed.data) });`:

```ts
async function fetchCurrentOffer(id: string, token?: string): Promise<FlightOffer> {
  const response = await requestDuffel(
    `/air/offers/${encodeURIComponent(id)}`,
    undefined,
    { token },
  );
  const result = offerSchema.safeParse(response);
  if (!result.success || result.data.id !== id) {
    raiseApiError(
      502,
      "DUFFEL_INVALID_RESPONSE",
      "The flight supplier returned an invalid response. Please try again.",
    );
  }
  if (Date.parse(result.data.expires_at) <= Date.now()) {
    raiseApiError(410, "OFFER_UNAVAILABLE", "This offer has expired. Please search again.");
  }
  return result.data;
}
```

Then add the booking route before `app.notFound`:

```ts
const checkingBooking = { data: { status: "checking" } } as const;

function replayBooking(context: Context, attempt: BookingAttempt) {
  if (attempt.status === "confirmed" && attempt.orderId)
    return context.json({ data: { orderId: attempt.orderId } });
  if (attempt.status === "failed")
    raiseApiError(
      422,
      "BOOKING_FAILED",
      "This booking could not be completed and nothing was booked. Please try again.",
    );
  return context.json(checkingBooking, 202);
}

function bookingsUnavailable(): never {
  raiseApiError(
    503,
    "BOOKINGS_UNAVAILABLE",
    "Booking is temporarily unavailable. Nothing was booked.",
  );
}

app.post("/api/bookings", async (context) => {
  const parsed = bookingRequestSchema.safeParse(
    await context.req.json().catch(() => undefined),
  );
  if (!parsed.success) {
    raiseApiError(
      400,
      "INVALID_BOOKING",
      parsed.error.issues[0]?.message ?? "Check the traveller details.",
    );
  }
  const booking = parsed.data;
  const token = requireDuffelTestToken();

  const earlier = await findBookingAttempt(booking.attemptId).catch(bookingsUnavailable);
  if (earlier) return replayBooking(context, earlier);

  const offer = await fetchCurrentOffer(booking.offerId, token);
  if (
    offer.total_amount !== booking.expectedTotal ||
    offer.total_currency !== booking.expectedCurrency
  ) {
    raiseApiError(409, "PRICE_CHANGED", "The fare has changed. Please review the new total.");
  }
  const mismatch = findTravellerMismatch(booking, offer);
  if (mismatch) raiseApiError(400, "INVALID_BOOKING", mismatch);

  const claimedElsewhere = await claimBookingAttempt({
    _id: booking.attemptId,
    offerId: offer.id,
    amount: offer.total_amount,
    currency: offer.total_currency,
  }).catch(bookingsUnavailable);
  if (claimedElsewhere) return replayBooking(context, claimedElsewhere);

  const result = await placeDuffelOrder(buildDuffelOrder(booking, offer), token);
  // A failed write only loses the replay; the customer must still see the real outcome.
  const record = (status: "confirmed" | "failed" | "unknown", orderId?: string) =>
    recordBookingOutcome(booking.attemptId, status, orderId).catch(() => {});

  if (result.outcome === "created") {
    const order = duffelOrderSchema.safeParse(result.order);
    if (order.success) {
      await record("confirmed", order.data.id);
      return context.json({ data: { orderId: order.data.id } });
    }
  }
  if (result.outcome === "rejected") {
    await record("failed");
    if (result.codes.some((code) => code === "offer_no_longer_available" || code === "offer_expired"))
      raiseApiError(410, "OFFER_UNAVAILABLE", "This fare has expired. Please search again.");
    if (result.codes.includes("price_changed"))
      raiseApiError(409, "PRICE_CHANGED", "The fare has changed. Please review the new total.");
    raiseApiError(
      422,
      "BOOKING_REJECTED",
      result.message ?? "The airline could not accept these details. Please check them and try again.",
    );
  }
  await record("unknown");
  return context.json(checkingBooking, 202);
});
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm --prefix flitel-b2c-service test`
Expected: PASS, including every existing test in `index.test.ts`.

Run: `npm --prefix flitel-b2c-service run typecheck`
Expected: no errors.

---

### Task 3: Backend `GET /api/bookings/:orderId` and API docs

**Files:**
- Modify: `flitel-b2c-service/src/index.ts`
- Modify: `flitel-b2c-service/src/bookings.test.ts`
- Modify: `flitel-b2c-service/README.md`

**Interfaces:**
- Consumes (Task 1): `orderId`, `duffelOrderSchema`.
- Produces: `GET /api/bookings/:orderId` returns `200 { data: <Duffel order> }`, `400 INVALID_ORDER_ID` or `502 DUFFEL_INVALID_RESPONSE`.

- [ ] **Step 1: Write the failing test** (append inside the `describe("booking API")` block)

```ts
  it("reads a booking back from Duffel by order id", async () => {
    duffelReplies();
    const response = await app.request("/api/bookings/ord_example123");
    expect(response.status).toBe(200);
    expect((await response.json()).data.booking_reference).toBe("K7XQ2M");

    fetchMock.mockClear();
    expect((await app.request("/api/bookings/not-an-order")).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();

    duffelReplies({ getOrder: () => Response.json({ data: { ...order, live_mode: true } }) });
    expect((await app.request("/api/bookings/ord_example123")).status).toBe(502);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix flitel-b2c-service test -- src/bookings.test.ts`
Expected: FAIL, with 404 instead of 200.

- [ ] **Step 3: Implement** (add `orderId` to the `./orders.js` import, and add the route before `app.notFound`)

```ts
app.get("/api/bookings/:orderId", async (context) => {
  const id = orderId.safeParse(context.req.param("orderId"));
  if (!id.success) raiseApiError(400, "INVALID_ORDER_ID", "Choose a valid booking.");
  const order = duffelOrderSchema.safeParse(
    await requestDuffel(`/air/orders/${encodeURIComponent(id.data)}`),
  );
  if (!order.success || order.data.id !== id.data) {
    raiseApiError(
      502,
      "DUFFEL_INVALID_RESPONSE",
      "The flight supplier returned an invalid response. Please try again.",
    );
  }
  return context.json({ data: order.data });
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm --prefix flitel-b2c-service test && npm --prefix flitel-b2c-service run typecheck`
Expected: PASS, with no type errors.

- [ ] **Step 5: Document the endpoints in `flitel-b2c-service/README.md`**

Add rows to the API table:

```markdown
| `POST /api/bookings`                   | `{ "data": { "orderId": "ord_..." } }`, or `202 { "data": { "status": "checking" } }` when the outcome is unknown |
| `GET /api/bookings/:orderId`           | `{ "data": <Duffel order> }`                                                                |
```

After the "Refresh the selected offer" paragraph, add:

```markdown
Booking accepts `{ attemptId, offerId, expectedTotal, expectedCurrency, travellers, contact }`. `attemptId` is a UUID that the client creates per confirm attempt. Repeating it never books twice; the recorded result is returned instead. The order is paid from the Duffel test balance using the amount of the offer the server has just fetched. `expectedTotal` only detects price changes (`409 PRICE_CHANGED`). A timeout, 5xx or unreadable Duffel reply returns `202 checking`, because seats may have been booked. Attempts are stored in `booking_attempts` without traveller details.
```

---

### Task 4: Frontend data: offer fields, order parsing, booking form schema

**Files:**
- Modify: `flitel-b2c/src/lib/duffel-offers.ts`
- Modify: `flitel-b2c/src/lib/flights.ts:158-178` (`FlightOffer`)
- Modify: `flitel-b2c/src/lib/duffel-offers.test.ts`
- Create: `flitel-b2c/src/lib/duffel-orders.ts`, `flitel-b2c/src/lib/duffel-orders.test.ts`
- Create: `flitel-b2c/src/lib/booking.ts`, `flitel-b2c/src/lib/booking.test.ts`

**Interfaces:**
- Produces:
  - `FlightOffer.totalAmount?: string`
  - `FlightOffer.identityDocumentsRequired?: boolean`
  - exported `amountSchema`, `currencySchema`, `sliceSchema` from `duffel-offers.ts`
  - `parseDuffelOrder(input: unknown): BookedFlight`, where `type BookedFlight = { id: string; bookingReference: string; totalAmount: string; currency: string; travellers: string[]; email?: string; slices: DuffelSlice[] }`
  - from `booking.ts`: `type TravellerInput`, `type BookingInput`, `createBookingInput(passengerIds: string[], documentsRequired: boolean): BookingInput`, `createBookingSchema(documentsRequired: boolean, today?: string)`, `type BookingDetails`, `fieldErrors(error: z.ZodError): Record<string, string>`, `isAdultOn(bornOn: string, day: string): boolean`

- [ ] **Step 1: Write the failing tests**

Add to `duffel-offers.test.ts`, inside the first `it`:

```ts
    expect(offer.totalAmount).toBe("450.25");
    expect(offer.identityDocumentsRequired).toBe(false);
    expect(
      parseDuffelOffer({ ...supplierOffer, passenger_identity_documents_required: true })
        .identityDocumentsRequired,
    ).toBe(true);
```

`flitel-b2c/src/lib/duffel-orders.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseDuffelOrder } from "./duffel-orders";
import { supplierOffer } from "./duffel-offer.fixture";

const order = {
  id: "ord_example123",
  live_mode: false,
  booking_reference: "K7XQ2M",
  total_amount: "450.25",
  total_currency: "USD",
  slices: supplierOffer.slices,
  passengers: [
    { title: "ms", given_name: "Priya", family_name: "Sharma", email: "priya@example.com" },
    { title: "mr", given_name: "Rahul", family_name: "Sharma", email: "priya@example.com" },
  ],
};

describe("Duffel order mapping", () => {
  it("keeps the reference, exact total, travellers and itinerary", () => {
    expect(parseDuffelOrder(order)).toMatchObject({
      id: "ord_example123",
      bookingReference: "K7XQ2M",
      totalAmount: "450.25",
      currency: "USD",
      travellers: ["Ms Priya Sharma", "Mr Rahul Sharma"],
      email: "priya@example.com",
    });
    expect(parseDuffelOrder(order).slices).toHaveLength(2);
  });

  it("refuses live or incomplete orders", () => {
    for (const change of [{ live_mode: true }, { booking_reference: "" }, { passengers: [] }]) {
      expect(() => parseDuffelOrder({ ...order, ...change })).toThrow();
    }
  });
});
```

`flitel-b2c/src/lib/booking.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createBookingInput,
  createBookingSchema,
  fieldErrors,
  isAdultOn,
} from "./booking";

const today = "2026-10-09";
const filled = (documentsRequired = false) => {
  const input = createBookingInput(["pas_1"], documentsRequired);
  Object.assign(input.travellers[0], {
    title: "ms",
    givenName: "Priya",
    familyName: "Sharma",
    bornOn: "1990-04-12",
    gender: "f",
  });
  input.contact = { email: "priya@example.com", phone: "+919876543210" };
  return input;
};

describe("booking form validation", () => {
  it("starts empty with one traveller per fare passenger", () => {
    const input = createBookingInput(["pas_1", "pas_2"], true);
    expect(input.travellers.map((traveller) => traveller.id)).toEqual(["pas_1", "pas_2"]);
    expect(input.travellers[0].passport).toEqual({ number: "", issuingCountry: "", expiresOn: "" });
    expect(createBookingInput(["pas_1"], false).travellers[0].passport).toBeUndefined();
  });

  it("accepts complete details", () => {
    expect(createBookingSchema(false, today).safeParse(filled()).success).toBe(true);
  });

  it("reports each problem against its field", () => {
    const input = filled();
    input.travellers[0].givenName = "Pr1ya";
    input.travellers[0].bornOn = "2015-01-01";
    input.contact.phone = "98765";
    const result = createBookingSchema(false, today).safeParse(input);
    expect(result.success).toBe(false);
    expect(fieldErrors(result.error!)).toMatchObject({
      "travellers.0.givenName": "Use English letters as shown on the passport.",
      "travellers.0.bornOn": "Adult travellers must be 18 or older.",
      "contact.phone": "Use the international format, for example +919876543210.",
    });
  });

  it("requires a valid, unexpired passport only when the airline asks", () => {
    const input = filled(true);
    expect(createBookingSchema(true, today).safeParse(input).success).toBe(false);
    input.travellers[0].passport = { number: "Z1234567", issuingCountry: "IN", expiresOn: "2026-10-01" };
    const expired = createBookingSchema(true, today).safeParse(input);
    expect(fieldErrors(expired.error!)["travellers.0.passport.expiresOn"]).toBe(
      "The passport must not have expired.",
    );
    input.travellers[0].passport.expiresOn = "2031-01-01";
    expect(createBookingSchema(true, today).safeParse(input).success).toBe(true);
  });

  it("counts adult age by calendar date", () => {
    expect(isAdultOn("2008-10-09", today)).toBe(true);
    expect(isAdultOn("2008-10-10", today)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm --prefix flitel-b2c test -- src/lib/duffel-offers.test.ts src/lib/duffel-orders.test.ts src/lib/booking.test.ts`
Expected: FAIL. The new modules are missing, and `totalAmount` is undefined.

- [ ] **Step 3: Implement**

In `lib/flights.ts`, add these to `FlightOffer` after `expiresAt?: string;`:

```ts
  totalAmount?: string;
  identityDocumentsRequired?: boolean;
```

In `lib/duffel-offers.ts`:
- change `const amountSchema`, `const currencySchema` and `const sliceSchema` to `export const`
- add `passenger_identity_documents_required: z.boolean().default(false),` to `offerSchema`
- in the object returned by `parseDuffelOffer`, after `currency: offer.total_currency,`, add:

```ts
    totalAmount: offer.total_amount,
    identityDocumentsRequired: offer.passenger_identity_documents_required,
```

`flitel-b2c/src/lib/duffel-orders.ts`:

```ts
import { z } from "zod";
import {
  amountSchema,
  currencySchema,
  sliceSchema,
  type DuffelSlice,
} from "./duffel-offers";

const titles: Record<string, string> = { mr: "Mr", ms: "Ms", mrs: "Mrs", miss: "Miss" };

const orderSchema = z.object({
  id: z.string().regex(/^ord_[A-Za-z0-9]+$/),
  live_mode: z.literal(false),
  booking_reference: z.string().min(1),
  total_amount: amountSchema,
  total_currency: currencySchema,
  slices: z.array(sliceSchema).min(1),
  passengers: z
    .array(
      z.object({
        title: z.string().nullish(),
        given_name: z.string(),
        family_name: z.string(),
        email: z.string().nullish(),
      }),
    )
    .min(1),
});

export type BookedFlight = {
  id: string;
  bookingReference: string;
  totalAmount: string;
  currency: string;
  travellers: string[];
  email?: string;
  slices: DuffelSlice[];
};

export function parseDuffelOrder(input: unknown): BookedFlight {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) throw new Error("The booking details are incomplete.");
  const order = parsed.data;
  return {
    id: order.id,
    bookingReference: order.booking_reference,
    totalAmount: order.total_amount,
    currency: order.total_currency,
    travellers: order.passengers.map((passenger) =>
      [titles[passenger.title ?? ""], passenger.given_name, passenger.family_name]
        .filter(Boolean)
        .join(" "),
    ),
    email: order.passengers[0].email ?? undefined,
    slices: order.slices,
  };
}
```

`flitel-b2c/src/lib/booking.ts`:

```ts
import { z } from "zod";

export type TravellerInput = {
  id: string;
  title: string;
  givenName: string;
  familyName: string;
  bornOn: string;
  gender: string;
  passport?: { number: string; issuingCountry: string; expiresOn: string };
};
export type BookingInput = {
  travellers: TravellerInput[];
  contact: { email: string; phone: string };
};

export function createBookingInput(
  passengerIds: string[],
  documentsRequired: boolean,
): BookingInput {
  return {
    travellers: passengerIds.map((id) => ({
      id,
      title: "",
      givenName: "",
      familyName: "",
      bornOn: "",
      gender: "",
      ...(documentsRequired && {
        passport: { number: "", issuingCountry: "", expiresOn: "" },
      }),
    })),
    contact: { email: "", phone: "" },
  };
}

export function isAdultOn(bornOn: string, day: string): boolean {
  const [year, month, date] = bornOn.split("-").map(Number);
  const [thisYear, thisMonth, thisDate] = day.split("-").map(Number);
  const birthdayPassed =
    thisMonth > month || (thisMonth === month && thisDate >= date);
  return thisYear - year - (birthdayPassed ? 0 : 1) >= 18;
}

const nameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z' -]{0,49}$/, "Use English letters as shown on the passport.");
const dateSchema = z.iso.date("Enter a valid date.");

export function createBookingSchema(
  documentsRequired: boolean,
  today = new Date().toISOString().slice(0, 10),
) {
  const passport = z.object({
    number: z.string().regex(/^[A-Z0-9]{5,20}$/, "Enter the passport number without spaces."),
    issuingCountry: z
      .string()
      .regex(/^[A-Z]{2}$/, "Use the two-letter country code, for example IN."),
    expiresOn: dateSchema.refine((date) => date > today, "The passport must not have expired."),
  });
  return z.object({
    travellers: z
      .array(
        z.object({
          id: z.string(),
          title: z.enum(["mr", "ms", "mrs", "miss"], "Choose a title."),
          givenName: nameSchema,
          familyName: nameSchema,
          bornOn: dateSchema.refine(
            (date) => isAdultOn(date, today),
            "Adult travellers must be 18 or older.",
          ),
          gender: z.enum(["m", "f"], "Choose a gender."),
          passport: documentsRequired ? passport : z.undefined(),
        }),
      )
      .min(1)
      .max(9),
    contact: z.object({
      email: z.email("Enter a valid email address.").max(254),
      phone: z
        .string()
        .trim()
        .regex(/^\+[1-9]\d{6,14}$/, "Use the international format, for example +919876543210."),
    }),
  });
}
export type BookingDetails = z.infer<ReturnType<typeof createBookingSchema>>;

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[issue.path.join(".")] ??= issue.message;
  return errors;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm --prefix flitel-b2c test && npm --prefix flitel-b2c run typecheck`
Expected: PASS, with no type errors.

---

### Task 5: Frontend server calls and proxy routes

**Files:**
- Create: `flitel-b2c/src/lib/request-body.ts`
- Modify: `flitel-b2c/src/app/api/flights/search/route.ts`
- Modify: `flitel-b2c/src/lib/flight-api.ts`, `flitel-b2c/src/lib/flight-api.test.ts`
- Create: `flitel-b2c/src/app/api/bookings/route.ts`, `flitel-b2c/src/app/api/bookings/route.test.ts`
- Create: `flitel-b2c/src/app/api/flights/offers/[id]/route.ts`

Read `node_modules/next/dist/docs/` on route handlers with dynamic segments before Step 3.

**Interfaces:**
- Consumes (Task 4): `parseDuffelOrder`, `BookedFlight`, `FlightOffer.totalAmount`.
- Produces:
  - `readJsonBody(request: Request, maxBytes: number): Promise<{ input: unknown } | { tooLarge: true }>`
  - `fetchSupplierOffer(id: string): Promise<FlightOffer>`
  - `createBooking(input: unknown): Promise<{ status: number; body: unknown }>`
  - `fetchBooking(orderId: string): Promise<BookedFlight>`
  - browser endpoints `POST /api/bookings` (same contract as the backend) and `GET /api/flights/offers/:id`, which returns `{ data: { totalAmount, currency } }` or `{ error: { message } }`

- [ ] **Step 1: Write the failing tests**

Append to `flight-api.test.ts` (add `createBooking` and `fetchBooking` to the import):

```ts
describe("booking backend connection", () => {
  it("passes the backend's booking answer through unchanged", async () => {
    vi.stubEnv("FLITEL_API_URL", "http://127.0.0.1:3001/");
    const request = vi
      .fn()
      .mockResolvedValue(Response.json({ error: { code: "PRICE_CHANGED", message: "Changed" } }, { status: 409 }));
    vi.stubGlobal("fetch", request);
    expect(await createBooking({ attemptId: "a" })).toEqual({
      status: 409,
      body: { error: { code: "PRICE_CHANGED", message: "Changed" } },
    });
    expect(request).toHaveBeenCalledWith(
      "http://127.0.0.1:3001/api/bookings",
      expect.objectContaining({ method: "POST", cache: "no-store", body: '{"attemptId":"a"}' }),
    );
  });

  it("treats an unreachable backend during booking as unknown, never failed", async () => {
    vi.stubEnv("FLITEL_API_URL", "http://127.0.0.1:3001");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await createBooking({})).toEqual({ status: 202, body: { data: { status: "checking" } } });
  });

  it("refuses to book without a backend and never fetches malformed booking ids", async () => {
    vi.stubEnv("FLITEL_API_URL", "");
    expect((await createBooking({})).status).toBe(503);
    vi.stubEnv("FLITEL_API_URL", "http://127.0.0.1:3001");
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await expect(fetchBooking("../secret")).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
```

`flitel-b2c/src/app/api/bookings/route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
const { createBooking } = vi.hoisted(() => ({ createBooking: vi.fn() }));
vi.mock("@/lib/flight-api", () => ({ createBooking }));
// Vitest has no "@/" alias here; the search route test resolves it the same way.
vi.mock("@/lib/request-body", () => import("../../../lib/request-body"));
import { POST } from "./route";

describe("booking proxy", () => {
  it("rejects an oversized body before forwarding it", async () => {
    const response = await POST(
      new Request("http://localhost/api/bookings", {
        method: "POST",
        body: "x".repeat(33 * 1024),
      }),
    );
    expect(response.status).toBe(413);
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("forwards the booking and returns the backend status", async () => {
    createBooking.mockResolvedValue({ status: 202, body: { data: { status: "checking" } } });
    const response = await POST(
      new Request("http://localhost/api/bookings", { method: "POST", body: '{"attemptId":"a"}' }),
    );
    expect(createBooking).toHaveBeenCalledWith({ attemptId: "a" });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ data: { status: "checking" } });
  });
});
```

In `app/api/flights/search/route.test.ts`, add this below the existing `@/lib/flights` mock, because the route will import the new helper:

```ts
vi.mock("@/lib/request-body", () => import("../../../../lib/request-body"));
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm --prefix flitel-b2c test -- src/lib/flight-api.test.ts src/app/api/bookings/route.test.ts`
Expected: FAIL. `createBooking` is not exported, and `./route` is missing.

- [ ] **Step 3: Implement**

`flitel-b2c/src/lib/request-body.ts` (the loop moved out of the search route unchanged):

```ts
export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<{ input: unknown } | { tooLarge: true }> {
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let byteCount = 0;
  let body = "";
  try {
    if (reader) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        byteCount += value.byteLength;
        if (byteCount > maxBytes) {
          await reader.cancel();
          return { tooLarge: true };
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    }
  } finally {
    reader?.releaseLock();
  }
  try {
    return { input: JSON.parse(body) };
  } catch {
    return { input: null };
  }
}
```

`app/api/flights/search/route.ts` becomes:

```ts
import { streamFlightOffers } from "@/lib/flight-api";
import { searchSchema } from "@/lib/flights";
import { readJsonBody } from "@/lib/request-body";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await readJsonBody(request, 4096);
  if ("tooLarge" in body)
    return Response.json({ error: "Search request is too large." }, { status: 413 });
  const search = searchSchema.safeParse(body.input);
  if (!search.success)
    return Response.json({ error: "Choose valid flight search details." }, { status: 400 });
  return streamFlightOffers(search.data, request.signal);
}
```

In `lib/flight-api.ts`:
- add `import { parseDuffelOrder, type BookedFlight } from "./duffel-orders";`
- add the helper `function backendUrl(): string { return process.env.FLITEL_API_URL!.trim().replace(/\/$/, ""); }` and use it in place of both existing `process.env.FLITEL_API_URL!.trim().replace(/\/$/, "")` expressions
- replace the Duffel half of `fetchFlightOffer` with a call to the new `fetchSupplierOffer`, then append the booking functions:

```ts
export async function fetchSupplierOffer(id: string): Promise<FlightOffer> {
  const response = z
    .object({ data: z.unknown() })
    .safeParse(await requestFlights(`/api/flights/offers/${encodeURIComponent(id)}`));
  if (!response.success)
    throw new Error("The flight search service returned an invalid response. Please try again.");
  return parseDuffelOffer(response.data.data);
}
```

so that `fetchFlightOffer` ends with:

```ts
  if (!/^off_[A-Za-z0-9_]+$/.test(id))
    throw new Error(
      "This sample fare is no longer available. Start a new search for Duffel test offers.",
    );
  return fetchSupplierOffer(id);
}
```

```ts
const checkingBooking = { status: 202, body: { data: { status: "checking" } } };

export async function createBooking(
  input: unknown,
): Promise<{ status: number; body: unknown }> {
  if (!hasFlightBackend())
    return {
      status: 503,
      body: { error: { code: "BOOKINGS_UNAVAILABLE", message: "Booking is not available yet." } },
    };
  try {
    const response = await fetch(`${backendUrl()}/api/bookings`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(75_000),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  } catch {
    // The order may already exist when the backend stops answering, so never report failure here.
    return checkingBooking;
  }
}

export async function fetchBooking(orderId: string): Promise<BookedFlight> {
  if (!/^ord_[A-Za-z0-9]+$/.test(orderId) || !hasFlightBackend())
    throw new Error("This booking could not be found.");
  const response = z
    .object({ data: z.unknown() })
    .safeParse(await requestFlights(`/api/bookings/${encodeURIComponent(orderId)}`));
  if (!response.success) throw new Error("This booking could not be loaded.");
  return parseDuffelOrder(response.data.data);
}
```

`flitel-b2c/src/app/api/bookings/route.ts`:

```ts
import { createBooking } from "@/lib/flight-api";
import { readJsonBody } from "@/lib/request-body";

export const maxDuration = 90;

export async function POST(request: Request) {
  const body = await readJsonBody(request, 32 * 1024);
  if ("tooLarge" in body)
    return Response.json(
      { error: { code: "REQUEST_TOO_LARGE", message: "The booking request is too large." } },
      { status: 413 },
    );
  const result = await createBooking(body.input);
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
```

`flitel-b2c/src/app/api/flights/offers/[id]/route.ts` (check the Next 16 docs for the second-argument type; `params` is a Promise):

```ts
import { fetchSupplierOffer, hasFlightBackend } from "@/lib/flight-api";

const unavailable = "This fare is no longer available. Please search again.";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!hasFlightBackend() || !/^off_[A-Za-z0-9_]+$/.test(id))
    return Response.json({ error: { message: unavailable } }, { status: 404 });
  try {
    const offer = await fetchSupplierOffer(id);
    return Response.json(
      { data: { totalAmount: offer.totalAmount, currency: offer.currency } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: { message: error instanceof Error ? error.message : unavailable } },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm --prefix flitel-b2c test && npm --prefix flitel-b2c run typecheck`
Expected: PASS, including the existing `search/route.test.ts` (413 and 400 behaviour unchanged).

---

### Task 6: Book page and booking form

**Files:**
- Create: `flitel-b2c/src/components/booking-panels.tsx`
- Create: `flitel-b2c/src/components/booking-form.tsx`
- Create: `flitel-b2c/src/app/flights/[id]/book/page.tsx`
- Modify: `flitel-b2c/src/app/flights/[id]/page.tsx` (price panel actions)
- Modify: `flitel-b2c/src/app/globals.css` (append)

Read the Next 16 docs on client components and `useRouter` (`next/navigation`) before Step 1.

**Interfaces:**
- Consumes:
  - Task 4: `createBookingInput`, `createBookingSchema`, `fieldErrors`, `BookingInput`, `BookingDetails`, `TravellerInput`
  - Task 5: the `/api/flights/offers/:id` and `/api/bookings` browser endpoints
  - existing: `fareConditionText`, `formatPrice`, `FlightLink`
- Produces: `<BookingForm offer route tripLabel searchHref />`, where `type BookableOffer = { id: string; totalAmount: string; currency: string; passengerIds: string[]; identityDocumentsRequired: boolean; refundCondition: FareCondition; changeCondition: FareCondition }`.

The UI has no unit tests; the logic it uses is tested in Tasks 4 and 5. It is verified by typecheck here and by the browser run in Task 8.

- [ ] **Step 1: Create `components/booking-panels.tsx`**

```tsx
import { Info, Mail, Plane, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { fareConditionText } from "@/components/flight-itinerary";
import type { FareCondition } from "@/lib/duffel-offers";
import type { BookingDetails, TravellerInput } from "@/lib/booking";

const titleLabels: Record<string, string> = { mr: "Mr", ms: "Ms", mrs: "Mrs", miss: "Miss" };

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="booking-field">
      <span className="field-label">{label}</span>
      {children}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}

export function TravellerFields({
  traveller,
  index,
  errors,
  today,
  onChange,
}: {
  traveller: TravellerInput;
  index: number;
  errors: Record<string, string>;
  today: string;
  onChange: (changes: Partial<TravellerInput>) => void;
}) {
  const error = (field: string) => errors[`travellers.${index}.${field}`];
  const passport = traveller.passport;
  const updatePassport = (changes: Partial<NonNullable<TravellerInput["passport"]>>) =>
    onChange({ passport: { ...passport!, ...changes } });
  return (
    <section className="itinerary-panel booking-panel">
      <div className="panel-heading">
        <span>
          <Plane size={18} /> Traveller {index + 1} · Adult
        </span>
        <span>As shown on the passport</span>
      </div>
      <div className="booking-fields">
        <Field label="Title" error={error("title")}>
          <select value={traveller.title} aria-invalid={Boolean(error("title"))} onChange={(event) => onChange({ title: event.target.value })}>
            <option value="">Choose</option>
            {Object.entries(titleLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label="Gender" error={error("gender")}>
          <select value={traveller.gender} aria-invalid={Boolean(error("gender"))} onChange={(event) => onChange({ gender: event.target.value })}>
            <option value="">Choose</option>
            <option value="f">Female</option>
            <option value="m">Male</option>
          </select>
        </Field>
        <Field label="First name" error={error("givenName")}>
          <input value={traveller.givenName} autoComplete={index === 0 ? "given-name" : "off"} aria-invalid={Boolean(error("givenName"))} onChange={(event) => onChange({ givenName: event.target.value })} />
        </Field>
        <Field label="Last name" error={error("familyName")}>
          <input value={traveller.familyName} autoComplete={index === 0 ? "family-name" : "off"} aria-invalid={Boolean(error("familyName"))} onChange={(event) => onChange({ familyName: event.target.value })} />
        </Field>
        <Field label="Date of birth" error={error("bornOn")}>
          <input type="date" max={today} value={traveller.bornOn} aria-invalid={Boolean(error("bornOn"))} onChange={(event) => onChange({ bornOn: event.target.value })} />
        </Field>
        {passport && (
          <>
            <Field label="Passport number" error={error("passport.number")}>
              <input value={passport.number} autoComplete="off" aria-invalid={Boolean(error("passport.number"))} onChange={(event) => updatePassport({ number: event.target.value.toUpperCase().replace(/\s/g, "") })} />
            </Field>
            <Field label="Issuing country (2 letters)" error={error("passport.issuingCountry")}>
              <input value={passport.issuingCountry} maxLength={2} aria-invalid={Boolean(error("passport.issuingCountry"))} onChange={(event) => updatePassport({ issuingCountry: event.target.value.toUpperCase() })} />
            </Field>
            <Field label="Passport expiry" error={error("passport.expiresOn")}>
              <input type="date" min={today} value={passport.expiresOn} aria-invalid={Boolean(error("passport.expiresOn"))} onChange={(event) => updatePassport({ expiresOn: event.target.value })} />
            </Field>
          </>
        )}
      </div>
    </section>
  );
}

export function ContactFields({
  contact,
  errors,
  onChange,
}: {
  contact: { email: string; phone: string };
  errors: Record<string, string>;
  onChange: (changes: Partial<{ email: string; phone: string }>) => void;
}) {
  return (
    <section className="itinerary-panel booking-panel">
      <div className="panel-heading">
        <span>
          <Mail size={18} /> Contact details
        </span>
        <span>For booking updates</span>
      </div>
      <div className="booking-fields">
        <Field label="Email" error={errors["contact.email"]}>
          <input type="email" autoComplete="email" value={contact.email} aria-invalid={Boolean(errors["contact.email"])} onChange={(event) => onChange({ email: event.target.value })} />
        </Field>
        <Field label="Phone with country code" error={errors["contact.phone"]}>
          <input type="tel" autoComplete="tel" placeholder="+919876543210" value={contact.phone} aria-invalid={Boolean(errors["contact.phone"])} onChange={(event) => onChange({ phone: event.target.value })} />
        </Field>
      </div>
    </section>
  );
}

export function ReviewPanels({
  details,
  refundCondition,
  changeCondition,
}: {
  details: BookingDetails;
  refundCondition: FareCondition;
  changeCondition: FareCondition;
}) {
  return (
    <>
      <section className="itinerary-panel booking-panel">
        <div className="panel-heading">
          <span>
            <Plane size={18} /> Travellers
          </span>
          <span>{details.travellers.length} {details.travellers.length === 1 ? "adult" : "adults"}</span>
        </div>
        <div className="review-list">
          {details.travellers.map((traveller) => (
            <div className="review-row" key={traveller.id}>
              <span>
                {titleLabels[traveller.title]} {traveller.givenName} {traveller.familyName}
              </span>
              <span>
                Born {traveller.bornOn}
                {traveller.passport && ` · Passport ending ${traveller.passport.number.slice(-3)}`}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="itinerary-panel booking-panel">
        <div className="panel-heading">
          <span>
            <Mail size={18} /> Booking updates go to
          </span>
          <span>{details.contact.email} · {details.contact.phone}</span>
        </div>
      </section>
      <section className="fare-panel">
        <h2>Fare rules</h2>
        <div>
          <ShieldCheck size={21} />
          <span>
            <strong>Refunds before departure</strong>
            <p>{fareConditionText(refundCondition, "Refund")}</p>
          </span>
        </div>
        <div>
          <ShieldCheck size={21} />
          <span>
            <strong>Changes before departure</strong>
            <p>{fareConditionText(changeCondition, "Change")}</p>
          </span>
        </div>
      </section>
    </>
  );
}

export function CheckingPanel({ reference }: { reference: string }) {
  return (
    <section className="itinerary-panel booking-panel" role="status">
      <div className="panel-heading">
        <span>
          <Info size={18} /> We’re checking your booking
        </span>
      </div>
      <div className="itinerary-body booking-checking">
        <p>
          The airline took longer than usual to answer, so we can’t yet confirm whether your seats
          were booked. Please don’t book this trip again. Quote reference{" "}
          <strong>{reference}</strong> if you contact us.
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create `components/booking-form.tsx`**

```tsx
"use client";

import { ArrowRight, Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import {
  CheckingPanel,
  ContactFields,
  ReviewPanels,
  TravellerFields,
} from "@/components/booking-panels";
import {
  createBookingInput,
  createBookingSchema,
  fieldErrors,
  type BookingDetails,
  type BookingInput,
} from "@/lib/booking";
import type { FareCondition } from "@/lib/duffel-offers";
import { formatPrice } from "@/lib/flights";

export type BookableOffer = {
  id: string;
  totalAmount: string;
  currency: string;
  passengerIds: string[];
  identityDocumentsRequired: boolean;
  refundCondition: FareCondition;
  changeCondition: FareCondition;
};

const latestPriceSchema = z.object({
  data: z.object({ totalAmount: z.string(), currency: z.string() }),
});
const bookingAnswerSchema = z.object({
  data: z.object({ orderId: z.string() }).optional(),
  error: z.object({ message: z.string() }).optional(),
});

export function BookingForm({
  offer,
  route,
  tripLabel,
  searchHref,
}: {
  offer: BookableOffer;
  route: { from: string; to: string };
  tripLabel: string;
  searchHref: string;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const schema = createBookingSchema(offer.identityDocumentsRequired, today);
  const [input, setInput] = useState<BookingInput>(() =>
    createBookingInput(offer.passengerIds, offer.identityDocumentsRequired),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"edit" | "review" | "checking">("edit");
  const [details, setDetails] = useState<BookingDetails>();
  const [total, setTotal] = useState({ amount: offer.totalAmount, currency: offer.currency });
  const [priceNotice, setPriceNotice] = useState<string>();
  const [problem, setProblem] = useState<{ message: string; searchAgain: boolean }>();
  const [busy, setBusy] = useState(false);
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [attemptId, setAttemptId] = useState("");
  const travellerCount = offer.passengerIds.length;

  function updateTraveller(index: number, changes: Partial<BookingInput["travellers"][number]>) {
    setInput((current) => ({
      ...current,
      travellers: current.travellers.map((traveller, position) =>
        position === index ? { ...traveller, ...changes } : traveller,
      ),
    }));
  }

  async function recheckPrice(): Promise<boolean> {
    const response = await fetch(`/api/flights/offers/${encodeURIComponent(offer.id)}`, {
      cache: "no-store",
    }).catch(() => undefined);
    const body: unknown = await response?.json().catch(() => null);
    const latest = latestPriceSchema.safeParse(body);
    if (!response?.ok || !latest.success) {
      const message = bookingAnswerSchema.safeParse(body).data?.error?.message;
      setProblem({
        message: message ?? "We couldn’t confirm the latest fare. Please try again.",
        searchAgain: true,
      });
      return false;
    }
    const { totalAmount, currency } = latest.data.data;
    if (totalAmount !== total.amount || currency !== total.currency) {
      setPriceNotice(
        `The fare changed from ${formatPrice(Number(total.amount), total.currency)} to ${formatPrice(Number(totalAmount), currency)}. Please check the new total.`,
      );
      setTotal({ amount: totalAmount, currency });
    }
    return true;
  }

  async function review() {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setProblem(undefined);
    setBusy(true);
    const priceKnown = await recheckPrice();
    setBusy(false);
    if (!priceKnown) return;
    setDetails(parsed.data);
    setAttemptId(crypto.randomUUID());
    setAcceptedRules(false);
    setStep("review");
  }

  async function confirm() {
    if (!details || busy) return;
    setBusy(true);
    setProblem(undefined);
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId,
        offerId: offer.id,
        expectedTotal: total.amount,
        expectedCurrency: total.currency,
        ...details,
      }),
    }).catch(() => undefined);
    const answer = bookingAnswerSchema.safeParse(await response?.json().catch(() => null));
    const orderId = answer.data?.data?.orderId;
    if (response?.status === 200 && orderId) {
      // Replace, so browser Back cannot return to a filled form and book the same trip twice.
      router.replace(`/bookings/${encodeURIComponent(orderId)}`);
      return;
    }
    // No answer, 202, or an unreadable 200: seats may be booked, so never offer a retry.
    if (!response || response.status === 202 || response.ok) {
      setStep("checking");
      return;
    }
    setBusy(false);
    setAttemptId(crypto.randomUUID());
    if (response.status === 409) {
      setAcceptedRules(false);
      await recheckPrice();
      return;
    }
    setProblem({
      message:
        answer.data?.error?.message ??
        "This booking could not be completed and nothing was booked. Please try again.",
      searchAgain: response.status === 410,
    });
  }

  return (
    <div className="details-layout">
      <div>
        {step === "edit" && (
          <form
            id="booking-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void review();
            }}
          >
            {input.travellers.map((traveller, index) => (
              <TravellerFields
                key={traveller.id}
                traveller={traveller}
                index={index}
                errors={errors}
                today={today}
                onChange={(changes) => updateTraveller(index, changes)}
              />
            ))}
            <ContactFields
              contact={input.contact}
              errors={errors}
              onChange={(changes) =>
                setInput((current) => ({ ...current, contact: { ...current.contact, ...changes } }))
              }
            />
          </form>
        )}
        {step === "review" && details && (
          <ReviewPanels
            details={details}
            refundCondition={offer.refundCondition}
            changeCondition={offer.changeCondition}
          />
        )}
        {step === "checking" && <CheckingPanel reference={attemptId.slice(0, 8).toUpperCase()} />}
      </div>
      <aside className="price-panel">
        <span className="eyebrow">YOUR JOURNEY AT A GLANCE</span>
        <h2>
          {route.from} <ArrowRight size={21} /> {route.to}
        </h2>
        <p>
          {tripLabel} · {travellerCount} {travellerCount === 1 ? "adult" : "adults"}
        </p>
        <div className="price-line">
          <span>Fare including taxes</span>
          <strong>{formatPrice(Number(total.amount), total.currency)}</strong>
        </div>
        <div className="price-total">
          <span>Journey total</span>
          <strong>{formatPrice(Number(total.amount), total.currency)}</strong>
        </div>
        {priceNotice && (
          <p className="price-notice" role="status">
            {priceNotice}
          </p>
        )}
        <div className="booking-preview-note">
          <Info size={18} />
          <p>Test booking. No real ticket is issued and no payment is taken.</p>
        </div>
        {problem && (
          <div className="booking-problem" role="alert">
            <p>{problem.message}</p>
            {problem.searchAgain && <Link href={searchHref}>Search flights again</Link>}
          </div>
        )}
        {step === "edit" && (
          <button type="submit" form="booking-form" className="button button-blue full-width" disabled={busy}>
            {busy ? "Checking the fare…" : "Review and confirm"}
          </button>
        )}
        {step === "review" && (
          <>
            <label className="fare-rules-check">
              <input
                type="checkbox"
                checked={acceptedRules}
                disabled={busy}
                onChange={(event) => setAcceptedRules(event.target.checked)}
              />
              I have read the fare rules and checked the traveller details.
            </label>
            <button
              type="button"
              className="button button-blue full-width"
              disabled={!acceptedRules || busy}
              onClick={() => void confirm()}
            >
              {busy ? "Booking…" : "Confirm booking"}
            </button>
            <button
              type="button"
              className="link-button"
              disabled={busy}
              onClick={() => {
                setStep("edit");
                setPriceNotice(undefined);
              }}
            >
              Edit details
            </button>
          </>
        )}
      </aside>
    </div>
  );
}
```

- [ ] **Step 3: Create `app/flights/[id]/book/page.tsx`**

```tsx
import type { Metadata } from "next";
import { ArrowLeft, Info } from "lucide-react";
import { notFound } from "next/navigation";
import { BookingForm } from "@/components/booking-form";
import { FlightLink } from "@/components/flight-transition";
import { fetchFlightOffer } from "@/lib/flight-api";
import { buildSearchQuery, findAirport, parseSearchParams } from "@/lib/flights";

export const metadata: Metadata = { title: "Traveller details" };

export default async function BookFlight({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let search;
  try {
    search = parseSearchParams(await searchParams);
  } catch {
    return (
      <main id="main" className="empty-state page-width">
        <h1>This search needs an update.</h1>
        <p>Choose your route and travel dates again.</p>
        <FlightLink href="/" className="button button-blue">
          Start a new search
        </FlightLink>
      </main>
    );
  }
  const { id } = await params;
  const query = buildSearchQuery(search);
  let offer;
  try {
    offer = await fetchFlightOffer(id, search);
  } catch (error) {
    return (
      <main id="main" className="empty-state page-width" role="alert">
        <h1>Let’s find an updated fare.</h1>
        <p>
          {error instanceof Error ? error.message : "This flight is unavailable. Please search again."}
        </p>
        <FlightLink href={`/flights?${query}`} className="button button-blue">
          Search flights again
        </FlightLink>
      </main>
    );
  }
  if (!offer?.slices || !offer.totalAmount || !offer.passengerIds) notFound();
  const outbound = offer.slices[0];
  const origin = outbound.segments[0].origin;
  const destination = outbound.segments.at(-1)!.destination;
  const tripLabel = offer.slices.length > 1 ? "Round trip" : "One way";
  return (
    <main id="main" className="details-page page-width">
      <FlightLink href={`/flights/${encodeURIComponent(offer.id)}?${query}`} className="back-link">
        <ArrowLeft size={15} /> Back to flight details
      </FlightLink>
      <div className="details-title">
        <div>
          <span className="eyebrow">ALMOST THERE</span>
          <h1>Who’s flying with us?</h1>
          <p>
            {findAirport(origin.iata_code)?.city ?? origin.name} to{" "}
            {findAirport(destination.iata_code)?.city ?? destination.name} · {tripLabel}
          </p>
        </div>
        <span className="sample-badge">
          <Info size={14} /> Test booking
        </span>
      </div>
      <BookingForm
        offer={{
          id: offer.id,
          totalAmount: offer.totalAmount,
          currency: offer.currency,
          passengerIds: offer.passengerIds,
          identityDocumentsRequired: offer.identityDocumentsRequired ?? false,
          refundCondition: offer.refundCondition,
          changeCondition: offer.changeCondition,
        }}
        route={{ from: origin.iata_code, to: destination.iata_code }}
        tripLabel={tripLabel}
        searchHref={`/flights?${query}`}
      />
    </main>
  );
}
```

- [ ] **Step 4: Add the button to the flight details page**

In `app/flights/[id]/page.tsx`, replace the block from `<div className="booking-preview-note">` through the "Compare other flights" `FlightLink` with:

```tsx
          {offer.slices ? (
            <FlightLink
              className="button button-blue full-width"
              href={`/flights/${encodeURIComponent(offer.id)}/book?${query}`}
            >
              Book this flight
            </FlightLink>
          ) : (
            <div className="booking-preview-note">
              <Info size={18} />
              <p>This is a preview. No seats are reserved and no payment will be taken.</p>
            </div>
          )}
          <FlightLink
            className={offer.slices ? "change-search" : "button button-blue full-width"}
            href={`/flights?${query}`}
          >
            Compare other flights
          </FlightLink>
```

- [ ] **Step 5: Append the styles to `app/globals.css`** (before the `@media (prefers-reduced-motion: reduce)` block)

```css
.booking-panel {
  margin-bottom: 20px;
}
.booking-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  padding: 22px 25px 25px;
}
.booking-field {
  display: grid;
  gap: 7px;
  font-size: 12px;
}
.booking-field .field-label {
  margin-bottom: 0;
}
.booking-field input,
.booking-field select {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 11px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  background: #fff;
}
.booking-field input:focus-visible,
.booking-field select:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 1px;
}
.booking-field [aria-invalid="true"] {
  border-color: #c2412d;
}
.field-error {
  color: #b4321f;
  font-size: 11px;
  line-height: 1.5;
}
.review-list {
  padding: 6px 25px 18px;
}
.review-row {
  display: flex;
  justify-content: space-between;
  gap: 15px;
  padding: 13px 0;
  border-top: 1px solid var(--line);
  font-size: 12px;
}
.review-row:first-child {
  border-top: 0;
}
.review-row span:last-child {
  color: var(--muted);
  text-align: right;
}
.booking-checking p {
  font-size: 12px;
  line-height: 1.8;
  color: var(--muted);
}
.price-notice {
  background: #fff6e5;
  color: #7a4b00;
  border-radius: 7px;
  padding: 12px 14px;
  font-size: 11px;
  line-height: 1.7;
  margin-top: 18px;
}
.booking-problem {
  background: #fdeeec;
  color: #8f2a1c;
  border-radius: 7px;
  padding: 12px 14px;
  font-size: 11px;
  line-height: 1.7;
  margin-bottom: 16px;
}
.booking-problem a {
  display: inline-block;
  margin-top: 6px;
  font-weight: 600;
  text-decoration: underline;
}
.fare-rules-check {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 12px;
  line-height: 1.6;
  color: #50637e;
  margin-bottom: 14px;
}
.link-button {
  display: block;
  width: 100%;
  margin-top: 14px;
  background: none;
  border: 0;
  color: #677890;
  font-size: 12px;
  cursor: pointer;
}
.link-button:hover {
  color: var(--blue);
}
.button:disabled,
.link-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}
.booking-reference {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 4px;
  margin-top: 14px;
}
.booking-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 6px 9px;
  border-radius: 5px;
  background: #e6f4ec;
  color: #1a6b47;
  font-size: 11px;
  font-weight: 600;
}
@media (max-width: 800px) {
  .booking-fields {
    grid-template-columns: 1fr;
    padding: 18px;
  }
  .review-row {
    flex-direction: column;
    gap: 4px;
  }
  .review-row span:last-child {
    text-align: left;
  }
}
```

- [ ] **Step 6: Verify**

Run: `npm --prefix flitel-b2c run typecheck && npm --prefix flitel-b2c test`
Expected: no type errors; all tests pass. If a lucide icon name fails to compile, use the closest existing icon (the existing pages already use `Plane`, `Info` and `ShieldCheck`).

---

### Task 7: Confirmation page

**Files:**
- Create: `flitel-b2c/src/app/bookings/[orderId]/page.tsx`

**Interfaces:**
- Consumes (Task 5): `fetchBooking`. Existing: `FlightItinerary`, `formatPrice`, `findAirport`, `FlightLink`.

- [ ] **Step 1: Create the page**

```tsx
import type { Metadata } from "next";
import { ArrowRight, Check, Info, Mail, Plane, Users } from "lucide-react";
import { FlightItinerary } from "@/components/flight-itinerary";
import { FlightLink } from "@/components/flight-transition";
import { fetchBooking } from "@/lib/flight-api";
import { findAirport, formatPrice } from "@/lib/flights";

export const metadata: Metadata = { title: "Booking confirmed" };

export default async function BookingConfirmation({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  let booking;
  try {
    booking = await fetchBooking(orderId);
  } catch {
    return (
      <main id="main" className="empty-state page-width" role="alert">
        <h1>We couldn’t load this booking.</h1>
        <p>Check the link, or try again in a moment.</p>
        <FlightLink href="/" className="button button-blue">
          Plan a journey
        </FlightLink>
      </main>
    );
  }
  const outbound = booking.slices[0];
  const origin = outbound.segments[0].origin;
  const destination = outbound.segments.at(-1)!.destination;
  const total = formatPrice(Number(booking.totalAmount), booking.currency);
  return (
    <main id="main" className="details-page page-width">
      <div className="details-title">
        <div>
          <span className="eyebrow">YOU’RE ALL SET</span>
          <h1>Your booking is confirmed.</h1>
          <p>
            {findAirport(origin.iata_code)?.city ?? origin.name} to{" "}
            {findAirport(destination.iata_code)?.city ?? destination.name} ·{" "}
            {booking.slices.length > 1 ? "Round trip" : "One way"}
          </p>
        </div>
        <span className="sample-badge">
          <Info size={14} /> Test booking
        </span>
      </div>
      <div className="details-layout">
        <div>
          <section className="itinerary-panel booking-panel">
            <div className="panel-heading">
              <span>
                <Plane size={18} /> Your flight
              </span>
            </div>
            <div className="itinerary-body">
              <FlightItinerary slices={booking.slices} />
            </div>
          </section>
          <section className="itinerary-panel booking-panel">
            <div className="panel-heading">
              <span>
                <Users size={18} /> Travellers
              </span>
              <span>
                {booking.travellers.length} {booking.travellers.length === 1 ? "adult" : "adults"}
              </span>
            </div>
            <div className="review-list">
              {booking.travellers.map((traveller) => (
                <div className="review-row" key={traveller}>
                  <span>{traveller}</span>
                  <span>Adult</span>
                </div>
              ))}
            </div>
          </section>
          {booking.email && (
            <section className="itinerary-panel booking-panel">
              <div className="panel-heading">
                <span>
                  <Mail size={18} /> Booking updates go to
                </span>
                <span>{booking.email}</span>
              </div>
            </section>
          )}
        </div>
        <aside className="price-panel">
          <span className="eyebrow">BOOKING REFERENCE</span>
          <p className="booking-reference">{booking.bookingReference}</p>
          <span className="booking-status">
            <Check size={14} /> Confirmed
          </span>
          <h2>
            {origin.iata_code} <ArrowRight size={21} /> {destination.iata_code}
          </h2>
          <div className="price-line">
            <span>Fare including taxes</span>
            <strong>{total}</strong>
          </div>
          <div className="price-total">
            <span>Total paid</span>
            <strong>{total}</strong>
          </div>
          <div className="booking-preview-note">
            <Info size={18} />
            <p>Test booking made in Duffel test mode. No real ticket was issued and no money was charged.</p>
          </div>
          <FlightLink className="button button-blue full-width" href="/">
            Plan another journey
          </FlightLink>
        </aside>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm --prefix flitel-b2c run typecheck && npm --prefix flitel-b2c run build`
Expected: no type errors. The build lists `/flights/[id]/book`, `/bookings/[orderId]`, `/api/bookings` and `/api/flights/offers/[id]`.

---

### Task 8: End-to-end verification

**Files:**
- Create (if missing): `.claude/launch.json`

- [ ] **Step 1: Full test, typecheck and build for both apps**

Run each, expecting success:
- `npm --prefix flitel-b2c-service test`
- `npm --prefix flitel-b2c-service run typecheck`
- `npm --prefix flitel-b2c-service run build`
- `npm --prefix flitel-b2c test`
- `npm --prefix flitel-b2c run typecheck`
- `npm --prefix flitel-b2c run build`

- [ ] **Step 2: Check prerequisites**

Local MongoDB must be running. `flitel-b2c-service/.env.local` needs `DUFFEL_ACCESS_TOKEN=duffel_test_...` and `MONGODB_URI`, and `flitel-b2c/.env.local` needs `FLITEL_API_URL=http://127.0.0.1:3001`. Check that the keys exist without printing their values. If one is missing, stop and ask the user.

- [ ] **Step 3: Start both servers**

`.claude/launch.json`:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "api", "runtimeExecutable": "npm", "runtimeArgs": ["--prefix", "flitel-b2c-service", "run", "dev"], "port": 3001 },
    { "name": "web", "runtimeExecutable": "npm", "runtimeArgs": ["--prefix", "flitel-b2c", "run", "dev"], "port": 3000 }
  ]
}
```

Start `api` and then `web` with the browser pane's `preview_start`.

- [ ] **Step 4: Walk the happy path in the browser**

Search a near-future one-way route with 1 adult. Duffel test mode returns "Duffel Airways" (ZZ) offers. Then:
1. Open an offer and check that "Book this flight" appears.
2. Submit the empty form and check that every field shows its error.
3. Fill valid details. Click "Review and confirm".
4. On the review step, check that Confirm stays disabled until the fare-rules box is ticked.
5. Confirm, and check that you land on `/bookings/ord_...` with a booking reference and the same total.
6. Check the `booking_attempts` document has `status: "confirmed"` and no traveller details.

- [ ] **Step 5: Check the edge paths and layouts**

- Press browser Back on the confirmation page. It must return to the flight details page, not to the filled form.
- Double-click "Confirm booking" quickly. Only one `/api/bookings` request goes out, and Duffel shows one order.
- Open the book page for an offer, wait until it expires (or edit the URL to a stale offer id), and check the "fare has expired" message and search link.
- Check a 2-adult search (two traveller panels), and an offer that requires passports if one turns up.
- Check desktop and mobile (375px) layouts. Fields stack to one column and the price panel sits below.
- Compare the book and confirmation pages against the flight details page for matching fonts, panels and buttons.

- [ ] **Step 6: Run the readability and comment reviews on the diff**

Apply the `readability-reviewer` and `documenting-code-comments` skills to all changed files and fix their findings.
