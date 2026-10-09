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
