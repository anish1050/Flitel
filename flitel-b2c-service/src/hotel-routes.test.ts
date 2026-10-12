import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "./rate-limit.js";
import { sessionHeader } from "./test-support.js";
import app from "./index.js";

const { attempts, mongo } = vi.hoisted(() => ({
  attempts: new Map<string, Record<string, unknown>>(),
  mongo: {
    down: false,
    throwsOnConnect: false,
    hideNextLookup: false,
    failInsert: false,
    failUpdate: false,
  },
}));
vi.mock("./mongodb.js", async () => {
  const { MongoServerError } = await import("mongodb");
  const ensureUp = () => {
    if (mongo.down) throw new Error("mongodb://user:secret@host unavailable");
  };
  const database = {
    collection: () => ({
      findOne: async ({ _id }: { _id: string }) => {
        ensureUp();
        if (mongo.hideNextLookup) {
          mongo.hideNextLookup = false;
          return null;
        }
        return attempts.get(_id) ?? null;
      },
      insertOne: async (document: { _id: string }) => {
        ensureUp();
        if (mongo.failInsert) throw new Error("write concern failure");
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
        if (mongo.failUpdate) throw new Error("write concern failure");
        Object.assign(attempts.get(_id)!, update.$set);
        return { acknowledged: true };
      },
    }),
  };
  return {
    getDatabase: () => {
      if (mongo.throwsOnConnect) throw new Error("MONGODB_URI is not set");
      return database;
    },
  };
});

const fetchMock = vi.fn<typeof fetch>();

const stay = {
  countryCode: "IN",
  cityName: "Mumbai",
  checkin: "2026-11-01",
  checkout: "2026-11-04",
  adults: 2,
  currency: "INR",
  guestNationality: "IN",
};
const { countryCode: _country, cityName: _city, ...roomsStay } = stay;

const ratesResponse = (changes: Record<string, unknown> = {}) => ({
  data: [
    {
      hotelId: "lp1",
      roomTypes: [
        {
          offerId: "offer_1",
          rates: [
            {
              rateId: "r1",
              name: "Deluxe Room",
              boardName: "Breakfast",
              retailRate: { total: [{ amount: 9000, currency: "INR" }], taxesAndFees: [] },
              cancellationPolicies: {
                cancelPolicyInfos: [{ cancelTime: "2026-10-30T00:00:00Z" }],
                refundableTag: "RFN",
              },
            },
          ],
          offerRetailRate: { amount: 9000, currency: "INR" },
        },
      ],
    },
  ],
  hotels: [{ id: "lp1", name: "Taj Example", stars: 5, rating: 8.7 }],
  sandbox: true,
  ...changes,
});
const detailsResponse = {
  data: { id: "lp1", hotelDescription: "<p>Seaside</p>", hotelFacilities: ["Pool"] },
};

function post(path: string, body: unknown, raw = false) {
  // Loops over many cases would trip the per-address limit; the limit has its own test.
  resetRateLimits();
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...sessionHeader() },
    body: raw ? String(body) : JSON.stringify(body),
  });
}
const callTo = (fragment: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes(fragment));

beforeEach(() => {
  resetRateLimits();
  attempts.clear();
  mongo.down = false;
  mongo.throwsOnConnect = false;
  mongo.hideNextLookup = false;
  mongo.failInsert = false;
  mongo.failUpdate = false;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T09:00:00Z"));
  vi.stubEnv("LITEAPI_KEY", "sand_example_key");
  vi.stubGlobal("fetch", fetchMock.mockReset());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("POST /api/hotels/search", () => {
  it("returns the cheapest rate per hotel and asks LiteAPI for sandbox rates", async () => {
    fetchMock.mockResolvedValue(Response.json(ratesResponse()));

    const response = await post("/api/hotels/search", stay);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      data: {
        hotels: [
          {
            id: "lp1",
            name: "Taj Example",
            stars: 5,
            rating: 8.7,
            price: { amount: 9000, currency: "INR" },
            refundable: true,
          },
        ],
      },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.liteapi.travel/v3.0/hotels/rates");
    expect(new Headers(init?.headers).get("X-API-Key")).toBe("sand_example_key");
    expect(JSON.parse(String(init?.body))).toEqual({
      countryCode: "IN",
      cityName: "Mumbai",
      occupancies: [{ adults: 2 }],
      currency: "INR",
      guestNationality: "IN",
      checkin: "2026-11-01",
      checkout: "2026-11-04",
      timeout: 6,
      includeHotelData: true,
      maxRatesPerHotel: 1,
      limit: 40,
    });
  });

  it("is 503 without a key and calls nothing", async () => {
    vi.stubEnv("LITEAPI_KEY", "");

    const response = await post("/api/hotels/search", stay);

    expect(response.status).toBe(503);
    expect((await response.json()).error).toEqual({
      code: "LITEAPI_NOT_CONFIGURED",
      message: "Hotel booking isn't available yet.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a past check-in", { ...stay, checkin: "2026-10-01" }],
    ["adults 0", { ...stay, adults: 0 }],
    ["a bad country", { ...stay, countryCode: "india" }],
  ])("rejects %s without calling LiteAPI", async (_name, body) => {
    const response = await post("/api/hotels/search", body);

    expect(response.status).toBe(400);
    const { error } = await response.json();
    expect(error.code).toBe("INVALID_STAY");
    expect(typeof error.message).toBe("string");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unreadable body without calling LiteAPI", async () => {
    const response = await post("/api/hotels/search", "{not json", true);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a body over 4 KB", async () => {
    const response = await post("/api/hotels/search", { ...stay, cityName: "x".repeat(5000) });

    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe("REQUEST_TOO_LARGE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a live response", async () => {
    fetchMock.mockResolvedValue(Response.json(ratesResponse({ sandbox: false })));

    const response = await post("/api/hotels/search", stay);

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("LITEAPI_LIVE_REFUSED");
  });

  it("turns an upstream failure into 502 HOTELS_UNAVAILABLE", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { code: 5000 } }, { status: 500 }));

    const response = await post("/api/hotels/search", stay);

    expect(response.status).toBe(502);
    expect((await response.json()).error).toEqual({
      code: "HOTELS_UNAVAILABLE",
      message: "Hotels are unavailable right now. Nothing was booked.",
    });
  });

  it("turns a timeout into 504 HOTELS_TIMEOUT", async () => {
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));

    const response = await post("/api/hotels/search", stay);

    expect(response.status).toBe(504);
    expect((await response.json()).error.code).toBe("HOTELS_TIMEOUT");
  });

  it("is 502 LITEAPI_INVALID_RESPONSE for a 2xx with the wrong shape", async () => {
    fetchMock.mockResolvedValue(Response.json({ hello: "world", sandbox: true }));

    const response = await post("/api/hotels/search", stay);

    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("LITEAPI_INVALID_RESPONSE");
  });

  it("treats a 404 and an empty data array as no hotels", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: { code: 2001 } }, { status: 404 }),
    );
    fetchMock.mockResolvedValueOnce(Response.json({ data: [], sandbox: true }));

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await post("/api/hotels/search", stay);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: { hotels: [] } });
    }
  });
});

describe("POST /api/hotels/:hotelId/rates", () => {
  function replies(details: () => Response | Promise<Response>) {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/hotels/rates")) return Response.json(ratesResponse());
      if (url.includes("/data/hotel")) return details();
      throw new Error(`Unexpected call ${url}`);
    });
  }

  it("returns the hotel with its rooms, enriched by the details call", async () => {
    replies(() => Response.json(detailsResponse));

    const response = await post("/api/hotels/lp1/rates", roomsStay);

    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.hotel).toEqual({
      id: "lp1",
      name: "Taj Example",
      stars: 5,
      rating: 8.7,
      description: "Seaside",
      facilities: ["Pool"],
    });
    expect(data.rooms).toEqual([
      {
        offerId: "offer_1",
        name: "Deluxe Room",
        boardName: "Breakfast",
        refundable: true,
        cancelBefore: "2026-10-30T00:00:00Z",
        price: { amount: 9000, currency: "INR" },
        taxesNotIncluded: [],
      },
    ]);
    const [, init] = callTo("/hotels/rates")[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      hotelIds: ["lp1"],
      occupancies: [{ adults: 2 }],
      currency: "INR",
      guestNationality: "IN",
      checkin: "2026-11-01",
      checkout: "2026-11-04",
      timeout: 6,
      includeHotelData: true,
    });
    expect(callTo("/data/hotel")[0][0]).toBe(
      "https://api.liteapi.travel/v3.0/data/hotel?hotelId=lp1",
    );
  });

  it("still answers when the details call fails", async () => {
    replies(() => {
      throw new TypeError("fetch failed");
    });

    const response = await post("/api/hotels/lp1/rates", roomsStay);

    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.hotel).toMatchObject({ id: "lp1", name: "Taj Example" });
    expect(data.hotel.description).toBeUndefined();
    expect(data.rooms).toHaveLength(1);
  });

  it("answers 200 with no rooms when the hotel has no availability", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("/hotels/rates")
        ? Response.json({ error: { code: 2001 } }, { status: 404 })
        : Response.json(detailsResponse),
    );

    const response = await post("/api/hotels/lp1/rates", roomsStay);

    expect(response.status).toBe(200);
    expect((await response.json()).data.rooms).toEqual([]);
  });

  it("rejects a bad hotel id without calling LiteAPI", async () => {
    const response = await post("/api/hotels/a/rates", roomsStay);

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_HOTEL_ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid stay without calling LiteAPI", async () => {
    const response = await post("/api/hotels/lp1/rates", { ...roomsStay, checkout: "2026-11-01" });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_STAY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is 503 without a key and calls nothing", async () => {
    vi.stubEnv("LITEAPI_KEY", "");

    const response = await post("/api/hotels/lp1/rates", roomsStay);

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a live response", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("/hotels/rates")
        ? Response.json(ratesResponse({ sandbox: false }))
        : Response.json(detailsResponse),
    );

    const response = await post("/api/hotels/lp1/rates", roomsStay);

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("LITEAPI_LIVE_REFUSED");
  });

  it("maps an upstream 500 to 502 and a timeout to 504", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("/hotels/rates")
        ? Response.json({}, { status: 500 })
        : Response.json(detailsResponse),
    );
    expect((await post("/api/hotels/lp1/rates", roomsStay)).status).toBe(502);

    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    const timedOut = await post("/api/hotels/lp1/rates", roomsStay);
    expect(timedOut.status).toBe(504);
    expect((await timedOut.json()).error.code).toBe("HOTELS_TIMEOUT");
  });
});

describe("GET /api/hotels/:hotelId", () => {
  const get = (path: string) => app.request(path);
  const details = {
    data: {
      id: "lp1",
      name: "Taj Example",
      main_photo: "https://img.example/m.jpg",
      address: "Apollo Bunder",
      starRating: 5,
      rating: 0,
      hotelDescription: "<p>Seaside</p>",
    },
    sandbox: true,
  };

  it("returns only the hotel and never asks for rates", async () => {
    fetchMock.mockResolvedValue(Response.json(details));

    const response = await get("/api/hotels/lp1");

    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toEqual({
      hotel: {
        id: "lp1",
        name: "Taj Example",
        photo: "https://img.example/m.jpg",
        address: "Apollo Bunder",
        stars: 5,
        description: "Seaside",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.liteapi.travel/v3.0/data/hotel?hotelId=lp1",
    );
  });

  it("rejects a bad hotel id without calling LiteAPI", async () => {
    const response = await get("/api/hotels/a");

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_HOTEL_ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is 503 without a key and calls nothing", async () => {
    vi.stubEnv("LITEAPI_KEY", "");

    expect((await get("/api/hotels/lp1")).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 404 HOTEL_NOT_FOUND when LiteAPI has no such hotel", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { code: 4000 } }, { status: 404 }));

    const response = await get("/api/hotels/lp1");

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("HOTEL_NOT_FOUND");
  });

  it("maps an upstream 500 to 502 and a timeout to 504", async () => {
    fetchMock.mockResolvedValue(Response.json({}, { status: 500 }));
    expect((await get("/api/hotels/lp1")).status).toBe(502);

    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    const timedOut = await get("/api/hotels/lp1");
    expect(timedOut.status).toBe(504);
    expect((await timedOut.json()).error.code).toBe("HOTELS_TIMEOUT");
  });

  it("refuses a live response and an unreadable body", async () => {
    fetchMock.mockResolvedValue(Response.json({ ...details, sandbox: false }));
    expect((await get("/api/hotels/lp1")).status).toBe(503);

    fetchMock.mockResolvedValue(Response.json({ data: "garbage" }));
    const invalid = await get("/api/hotels/lp1");
    expect(invalid.status).toBe(502);
    expect((await invalid.json()).error.code).toBe("LITEAPI_INVALID_RESPONSE");
  });
});

const prebookResponse = (changes: Record<string, unknown> = {}) => ({
  data: {
    prebookId: "pb_123",
    hotelId: "lp1",
    checkin: "2026-11-01",
    checkout: "2026-11-04",
    currency: "INR",
    price: 27000,
    priceDifferencePercent: 0,
    cancellationChanged: false,
    boardChanged: false,
    transactionId: "tr_456",
    secretKey: "secret_789",
    roomTypes: [{ rates: [{ cancellationPolicies: { refundableTag: "RFN" } }] }],
    ...changes,
  },
  sandbox: true,
});
const bookResponse = { data: { bookingId: "bk_1", status: "CONFIRMED" }, sandbox: true };
const ref = "7d1f1c0e-2c1f-4c4e-9f33-0f6a2c0b5a11";
const storedBooking = {
  data: {
    bookingId: "bk_1",
    status: "CONFIRMED",
    clientReference: ref,
    hotelConfirmationCode: "HC-9",
    hotel: { hotelId: "lp1", name: "Taj Example" },
    checkin: "2026-11-01",
    checkout: "2026-11-04",
    holder: {
      firstName: "Priya",
      lastName: "Sharma",
      email: "priya@example.com",
      phone: "+919876543210",
    },
    price: 27000,
    currency: "INR",
    cancellationPolicies: { refundableTag: "NRFN", cancelPolicyInfos: [] },
  },
};
const errorBody = (code: number) => ({ error: { code, description: "x", message: "x" } });

type LiteapiReply = () => Response | Promise<Response>;
function bookingReplies(
  replies: Partial<Record<"prebook" | "book" | "bookings", LiteapiReply>> = {},
) {
  const {
    prebook = () => Response.json(prebookResponse()),
    book = () => Response.json(bookResponse),
    bookings = () => Response.json(storedBooking),
  } = replies;
  fetchMock.mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === "/v3.0/rates/prebook") return prebook();
    if (path === "/v3.0/rates/book") return book();
    if (path.startsWith("/v3.0/bookings/")) return bookings();
    throw new Error(`Unexpected LiteAPI call ${path}`);
  });
}
const bookCalls = () => callTo("/rates/book");

describe("POST /api/hotels/prebook", () => {
  it("prebooks with the payment SDK and returns what the card form needs", async () => {
    bookingReplies();

    const response = await post("/api/hotels/prebook", { offerId: "offer_abc123" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        prebookId: "pb_123",
        transactionId: "tr_456",
        secretKey: "secret_789",
        hotelId: "lp1",
        checkin: "2026-11-01",
        checkout: "2026-11-04",
        price: { amount: 27000, currency: "INR" },
        priceDifferencePercent: 0,
        cancellationChanged: false,
        boardChanged: false,
        refundable: true,
      },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://book.liteapi.travel/v3.0/rates/prebook");
    expect(new Headers(init?.headers).get("X-API-Key")).toBe("sand_example_key");
    expect(JSON.parse(String(init?.body))).toEqual({
      offerId: "offer_abc123",
      usePaymentSdk: true,
    });
  });

  it("maps supplier errors", async () => {
    const cases: [LiteapiReply, number, string][] = [
      [() => Response.json(errorBody(4040), { status: 408 }), 410, "OFFER_UNAVAILABLE"],
      [() => Response.json(errorBody(4040), { status: 400 }), 410, "OFFER_UNAVAILABLE"],
      [() => Response.json(errorBody(4002), { status: 400 }), 410, "OFFER_UNAVAILABLE"],
      [() => Response.json(errorBody(4016), { status: 408 }), 502, "HOTELS_UNAVAILABLE"],
      [() => Response.json({}, { status: 401 }), 503, "HOTELS_UNAVAILABLE"],
      [() => Response.json({}, { status: 403 }), 503, "HOTELS_UNAVAILABLE"],
      [() => new Response("boom", { status: 500 }), 502, "HOTELS_UNAVAILABLE"],
      [() => Promise.reject(new DOMException("t", "TimeoutError")), 504, "HOTELS_TIMEOUT"],
      [
        () => Response.json(prebookResponse({ secretKey: undefined })),
        502,
        "LITEAPI_INVALID_RESPONSE",
      ],
      [
        () => Response.json(prebookResponse({ transactionId: "tr.456" })),
        502,
        "LITEAPI_INVALID_RESPONSE",
      ],
      [
        () => Response.json(prebookResponse({ transactionId: "t".repeat(201) })),
        502,
        "LITEAPI_INVALID_RESPONSE",
      ],
      [
        () => Response.json({ ...prebookResponse(), sandbox: false }),
        503,
        "LITEAPI_LIVE_REFUSED",
      ],
    ];
    for (const [prebook, status, code] of cases) {
      fetchMock.mockReset();
      bookingReplies({ prebook });
      const response = await post("/api/hotels/prebook", { offerId: "offer_abc123" });
      expect([response.status, (await response.json()).error.code]).toEqual([status, code]);
    }
  });

  it("validates the offer id and needs a key, calling nothing", async () => {
    bookingReplies();
    expect((await post("/api/hotels/prebook", { offerId: "x" })).status).toBe(400);
    expect((await post("/api/hotels/prebook", "not json", true)).status).toBe(400);

    vi.stubEnv("LITEAPI_KEY", "");
    const response = await post("/api/hotels/prebook", { offerId: "offer_abc123" });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("LITEAPI_NOT_CONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

const guest = {
  firstName: "Priya",
  lastName: "Sharma",
  email: "priya@example.com",
  phone: "+919876543210",
};
const hotelBooking = (changes: Record<string, unknown> = {}) => ({
  attemptId: crypto.randomUUID(),
  prebookId: `pb_${crypto.randomUUID()}`,
  transactionId: "tr_456",
  expectedTotal: 27000,
  expectedCurrency: "INR",
  holder: guest,
  ...changes,
});
const placeBooking = (body: unknown) => post("/api/hotel-bookings", body);
const attemptFor = (request: { prebookId: string }) =>
  attempts.get(`hotel:${request.prebookId}`);

describe("POST /api/hotel-bookings", () => {
  it("books once, answers with the booking id and replays it for the same attempt", async () => {
    bookingReplies();
    const request = hotelBooking();

    const first = await placeBooking(request);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ data: { bookingId: "bk_1" } });

    const [url, init] = bookCalls()[0];
    expect(url).toBe("https://book.liteapi.travel/v3.0/rates/book");
    expect(JSON.parse(String(init?.body))).toEqual({
      prebookId: request.prebookId,
      clientReference: request.attemptId,
      holder: guest,
      guests: [
        {
          occupancyNumber: 1,
          firstName: "Priya",
          lastName: "Sharma",
          email: "priya@example.com",
        },
      ],
      payment: { method: "TRANSACTION_ID", transactionId: "tr_456" },
    });

    const repeat = await placeBooking(request);
    expect(await repeat.json()).toEqual({ data: { bookingId: "bk_1" } });
    expect(bookCalls()).toHaveLength(1);
    expect([...attempts.keys()]).toEqual([`hotel:${request.prebookId}`]);
    expect(attemptFor(request)).toMatchObject({
      offerId: request.prebookId,
      amount: "27000",
      currency: "INR",
      status: "confirmed",
      orderId: "bk_1",
      clientReference: request.attemptId,
    });
    expect(JSON.stringify([...attempts.values()])).not.toMatch(
      /Priya|Sharma|example\.com|9876543210/,
    );
  });

  it("books one prebook once, even for a second attemptId", async () => {
    bookingReplies();
    const first = hotelBooking();
    const second = hotelBooking({ prebookId: first.prebookId });

    expect((await placeBooking(first)).status).toBe(200);
    const replay = await placeBooking(second);

    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ data: { bookingId: "bk_1" } });
    expect(bookCalls()).toHaveLength(1);
    expect(attempts.size).toBe(1);
  });

  it("replays an unknown outcome to a second attemptId without calling LiteAPI", async () => {
    bookingReplies({ book: () => new Response("boom", { status: 500 }) });
    const first = hotelBooking();

    await placeBooking(first);
    const replay = await placeBooking(hotelBooking({ prebookId: first.prebookId }));

    expect(replay.status).toBe(202);
    expect(bookCalls()).toHaveLength(1);
  });

  it("never tells the customer nothing was booked after payment", async () => {
    const messages: string[] = [];
    const collect = async (response: Response) => {
      messages.push((await response.json()).error.message);
    };
    const failures: LiteapiReply[] = [
      () => Response.json(errorBody(4003), { status: 400 }),
      () => Response.json(errorBody(4012), { status: 410 }),
      () => Response.json({}, { status: 401 }),
    ];
    for (const book of failures) {
      fetchMock.mockReset();
      bookingReplies({ book });
      const request = hotelBooking();
      await collect(await placeBooking(request));
      await collect(await placeBooking(request));
    }
    for (const unavailable of ["down", "failInsert"] as const) {
      mongo[unavailable] = true;
      await collect(await placeBooking(hotelBooking()));
      mongo[unavailable] = false;
    }

    expect(messages).toHaveLength(8);
    for (const message of messages) expect(message).not.toMatch(/nothing was booked/i);
    expect(new Set(messages)).toEqual(
      new Set([
        "The hotel could not accept these details.",
        "This booking could not be completed. Please keep your reference.",
        "This room is no longer available. Please keep your reference.",
        "Hotel booking is unavailable right now. Please keep your reference.",
        "We couldn't process this booking right now. Please keep your reference.",
      ]),
    );
  });

  it("reports an unknown outcome and never books twice for the same attempt", async () => {
    const replies: LiteapiReply[] = [
      () => Promise.reject(new DOMException("timed out", "TimeoutError")),
      () => new Response("upstream failure", { status: 500 }),
      () => new Response("not json", { status: 200 }),
      () => Response.json({ data: { bookingId: "bk_1", status: "PENDING" } }),
      () => Response.json({ ...bookResponse, sandbox: false }),
      () => Response.json(errorBody(4005), { status: 400 }),
      () => Response.json(errorBody(2014), { status: 400 }),
    ];
    for (const book of replies) {
      fetchMock.mockReset();
      bookingReplies({ book });
      const request = hotelBooking();

      const response = await placeBooking(request);
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ data: { status: "checking" } });
      expect(attemptFor(request)?.status).toBe("unknown");

      const repeat = await placeBooking(request);
      expect(repeat.status).toBe(202);
      expect(bookCalls()).toHaveLength(1);
    }
  });

  it("records explicit rejections and replays them as BOOKING_FAILED", async () => {
    const cases: [LiteapiReply, number, string][] = [
      [() => Response.json(errorBody(4003), { status: 400 }), 422, "BOOKING_REJECTED"],
      [() => Response.json(errorBody(4012), { status: 410 }), 410, "ROOM_UNAVAILABLE"],
      [() => Response.json(errorBody(2013), { status: 400 }), 410, "ROOM_UNAVAILABLE"],
      [() => Response.json({}, { status: 401 }), 503, "HOTELS_UNAVAILABLE"],
    ];
    for (const [book, status, code] of cases) {
      fetchMock.mockReset();
      bookingReplies({ book });
      const request = hotelBooking();

      const response = await placeBooking(request);
      expect([response.status, (await response.json()).error.code]).toEqual([status, code]);
      expect(attemptFor(request)?.status).toBe("failed");

      const repeat = await placeBooking(request);
      expect(repeat.status).toBe(422);
      expect((await repeat.json()).error.code).toBe("BOOKING_FAILED");
      expect(bookCalls()).toHaveLength(1);
    }
  });

  it("answers with the real outcome when recording it fails, and replays checking", async () => {
    bookingReplies();
    mongo.failUpdate = true;
    const request = hotelBooking();

    const first = await placeBooking(request);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ data: { bookingId: "bk_1" } });
    expect(attemptFor(request)?.status).toBe("pending");

    const repeat = await placeBooking(request);
    expect(repeat.status).toBe(202);
    expect(await repeat.json()).toEqual({ data: { status: "checking" } });
    expect(bookCalls()).toHaveLength(1);
  });

  it("treats a lost claim race as checking and never books", async () => {
    bookingReplies();
    const request = hotelBooking();
    attempts.set(`hotel:${request.prebookId}`, {
      _id: `hotel:${request.prebookId}`,
      status: "pending",
    });
    mongo.hideNextLookup = true;

    const response = await placeBooking(request);

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ data: { status: "checking" } });
    expect(bookCalls()).toHaveLength(0);
  });

  it("books nothing while the database is unavailable", async () => {
    for (const unavailable of ["down", "throwsOnConnect", "failInsert"] as const) {
      bookingReplies();
      mongo[unavailable] = true;
      fetchMock.mockClear();

      const response = await placeBooking(hotelBooking());

      expect(response.status).toBe(503);
      const text = await response.text();
      expect(JSON.parse(text).error.code).toBe("BOOKINGS_UNAVAILABLE");
      expect(text).not.toContain("secret");
      expect(fetchMock).not.toHaveBeenCalled();
      mongo[unavailable] = false;
    }
  });

  it("validates the body and the size before touching MongoDB or LiteAPI", async () => {
    bookingReplies();
    for (const changes of [
      { attemptId: "1" },
      { expectedTotal: 0 },
      { holder: { ...guest, phone: "123" } },
      { holder: { ...guest, email: "x" } },
    ]) {
      const response = await placeBooking(hotelBooking(changes));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_BOOKING");
    }
    expect((await placeBooking({ ...hotelBooking(), padding: "x".repeat(9 * 1024) })).status).toBe(
      413,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(attempts.size).toBe(0);
  });

  it("is 503 without a key and records nothing", async () => {
    bookingReplies();
    vi.stubEnv("LITEAPI_KEY", "");

    const response = await placeBooking(hotelBooking());

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("LITEAPI_NOT_CONFIGURED");
    expect(attempts.size).toBe(0);
  });
});

describe("GET /api/hotel-bookings/:bookingId", () => {
  const readBack = (id: string, query = `?ref=${ref}`) =>
    app.request(`/api/hotel-bookings/${id}${query}`);

  it("returns the booking for the attempt that created it, without the phone", async () => {
    bookingReplies();

    const response = await readBack("bk_1");

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      data: {
        bookingId: "bk_1",
        status: "CONFIRMED",
        hotel: { id: "lp1", name: "Taj Example" },
        checkin: "2026-11-01",
        checkout: "2026-11-04",
        holder: { firstName: "Priya", lastName: "Sharma", email: "priya@example.com" },
        price: 27000,
        currency: "INR",
        cancellation: { refundableTag: "NRFN", cancelPolicyInfos: [] },
        hotelConfirmationCode: "HC-9",
      },
    });
    expect(text).not.toContain("9876543210");
    expect(text).not.toContain(ref);
    expect(fetchMock.mock.calls[0][0]).toBe("https://book.liteapi.travel/v3.0/bookings/bk_1");
  });

  it("answers 404 for a booking that belongs to another attempt, without revealing it", async () => {
    const other = "11111111-2222-4333-8444-555555555555";
    for (const stored of [
      { data: { ...storedBooking.data, clientReference: other } },
      { data: { ...storedBooking.data, clientReference: undefined } },
    ]) {
      fetchMock.mockReset();
      bookingReplies({ bookings: () => Response.json(stored) });
      const response = await readBack("bk_1");
      expect(response.status).toBe(404);
      const text = await response.text();
      expect(JSON.parse(text).error.code).toBe("BOOKING_NOT_FOUND");
      expect(text).not.toMatch(/Priya|Taj/);
    }
  });

  it("matches the reference case-insensitively", async () => {
    bookingReplies();
    expect((await readBack("bk_1", `?ref=${ref.toUpperCase()}`)).status).toBe(200);
  });

  it("needs a valid id and a UUID reference before calling LiteAPI", async () => {
    bookingReplies();
    expect((await readBack("a%20b")).status).toBe(400);
    expect((await readBack("ab")).status).toBe(400);
    for (const query of ["", "?ref=", "?ref=bk_1", "?ref=not-a-uuid"]) {
      const response = await readBack("bk_1", query);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_BOOKING_REF");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a missing booking and supplier failures", async () => {
    const cases: [LiteapiReply, number, string][] = [
      [() => new Response(null, { status: 404 }), 404, "BOOKING_NOT_FOUND"],
      [() => new Response(null, { status: 204 }), 404, "BOOKING_NOT_FOUND"],
      [
        () =>
          Response.json({ error: { code: 4041, message: "Booking Not Found" } }, { status: 400 }),
        404,
        "BOOKING_NOT_FOUND",
      ],
      [
        () => Response.json({ error: { message: "booking not found" } }, { status: 200 }),
        404,
        "BOOKING_NOT_FOUND",
      ],
      [() => new Response("boom", { status: 500 }), 502, "HOTELS_UNAVAILABLE"],
      [() => Promise.reject(new DOMException("t", "TimeoutError")), 502, "HOTELS_UNAVAILABLE"],
      [
        () => Response.json({ data: { clientReference: ref } }),
        502,
        "LITEAPI_INVALID_RESPONSE",
      ],
    ];
    for (const [bookings, status, code] of cases) {
      fetchMock.mockReset();
      bookingReplies({ bookings });
      const response = await readBack("bk_1");
      expect([response.status, (await response.json()).error.code]).toEqual([status, code]);
    }
  });
});
