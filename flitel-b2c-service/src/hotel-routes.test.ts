import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "./index.js";

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
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? String(body) : JSON.stringify(body),
  });
}
const callTo = (fragment: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes(fragment));

beforeEach(() => {
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
