import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  createHotelBooking,
  fetchHotelBooking,
  fetchHotelDetails,
  fetchHotelRooms,
  prebookRoom,
  searchHotels,
} from "./hotel-api";

const backend = "http://127.0.0.1:3001";
const stay = { destination: "goa", checkin: "2026-10-20", checkout: "2026-10-23", adults: 2 };
const ref = "7d1c1f0a-3b5e-4a39-9a6e-2f4f0c7b9d11";
const hotel = { id: "lp1", name: "Sea View", price: { amount: 5400, currency: "INR" }, refundable: true };
const booking = {
  bookingId: "bk_1",
  status: "CONFIRMED",
  hotel: { id: "lp1", name: "Sea View" },
  checkin: "2026-10-20",
  checkout: "2026-10-23",
  holder: { firstName: "Asha", lastName: "Rao", email: "asha@example.com" },
  price: 16200,
  currency: "INR",
  cancellation: { cancelPolicyInfos: [] },
};

function stubBackend(response: Response | Error) {
  const request = vi.fn();
  if (response instanceof Error) request.mockRejectedValue(response);
  else request.mockResolvedValue(response);
  vi.stubGlobal("fetch", request);
  vi.stubEnv("FLITEL_API_URL", `${backend}/`);
  return request;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("hotel search", () => {
  it("posts the destination's city, the stay and the constants without caching", async () => {
    const request = stubBackend(Response.json({ data: { hotels: [hotel] } }));
    expect(await searchHotels(stay)).toEqual([hotel]);
    expect(request).toHaveBeenCalledWith(
      `${backend}/api/hotels/search`,
      expect.objectContaining({ method: "POST", cache: "no-store", signal: expect.any(AbortSignal) }),
    );
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
      countryCode: "IN",
      cityName: "Goa",
      checkin: "2026-10-20",
      checkout: "2026-10-23",
      adults: 2,
      currency: "INR",
      guestNationality: "IN",
    });
  });

  it("fails safely on a schema failure, a backend error and an unreachable backend", async () => {
    stubBackend(Response.json({ data: { hotels: [{ id: "lp1" }] } }));
    await expect(searchHotels(stay)).rejects.toThrow(/invalid response/);
    stubBackend(Response.json({}, { status: 502 }));
    await expect(searchHotels(stay)).rejects.toThrow(/unavailable right now/);
    stubBackend(new TypeError("fetch failed"));
    await expect(searchHotels(stay)).rejects.toThrow(/unavailable right now/);
  });

  it("says so when no backend is configured, without fetching", async () => {
    const request = stubBackend(Response.json({}));
    vi.stubEnv("FLITEL_API_URL", "");
    await expect(searchHotels(stay)).rejects.toThrow(/unavailable/);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("hotel rooms", () => {
  it("posts the stay to the hotel's rates endpoint", async () => {
    const request = stubBackend(
      Response.json({ data: { hotel: { id: "lp1", name: "Sea View" }, rooms: [] } }),
    );
    expect(await fetchHotelRooms("lp1", stay)).toEqual({
      hotel: { id: "lp1", name: "Sea View" },
      rooms: [],
    });
    expect(request.mock.calls[0][0]).toBe(`${backend}/api/hotels/lp1/rates`);
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
      checkin: "2026-10-20",
      checkout: "2026-10-23",
      adults: 2,
      currency: "INR",
      guestNationality: "IN",
    });
  });

  it("never fetches for a malformed hotel id", async () => {
    const request = stubBackend(Response.json({}));
    await expect(fetchHotelRooms("../bookings", stay)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});

describe("hotel details", () => {
  it("gets the hotel from the details-only endpoint without caching", async () => {
    const request = stubBackend(
      Response.json({ data: { hotel: { id: "lp1", name: "Sea View" } } }),
    );
    expect(await fetchHotelDetails("lp1")).toEqual({ id: "lp1", name: "Sea View" });
    expect(request).toHaveBeenCalledWith(
      `${backend}/api/hotels/lp1`,
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("never fetches for a malformed hotel id", async () => {
    const request = stubBackend(Response.json({}));
    await expect(fetchHotelDetails("../bookings")).rejects.toThrow(/could not be found/);
    expect(request).not.toHaveBeenCalled();
  });

  it("reports a 404 as a missing hotel, other failures as unavailable", async () => {
    stubBackend(Response.json({ error: { code: "HOTEL_NOT_FOUND" } }, { status: 404 }));
    await expect(fetchHotelDetails("lp1")).rejects.toThrow(/hotel could not be found/);
    stubBackend(Response.json({}, { status: 502 }));
    await expect(fetchHotelDetails("lp1")).rejects.toThrow(/unavailable right now/);
    stubBackend(Response.json({ data: { hotel: { id: "lp1" } } }));
    await expect(fetchHotelDetails("lp1")).rejects.toThrow(/invalid response/);
  });
});

describe("prebook", () => {
  it("passes the backend's status and body through", async () => {
    const request = stubBackend(
      Response.json({ error: { code: "OFFER_UNAVAILABLE", message: "gone" } }, { status: 410 }),
    );
    expect(await prebookRoom("offer-12345678")).toEqual({
      status: 410,
      body: { error: { code: "OFFER_UNAVAILABLE", message: "gone" } },
    });
    expect(request).toHaveBeenCalledWith(
      `${backend}/api/hotels/prebook`,
      expect.objectContaining({ method: "POST", cache: "no-store", body: '{"offerId":"offer-12345678"}' }),
    );
  });

  it("answers HOTELS_UNAVAILABLE when the backend is missing or unreachable", async () => {
    stubBackend(new TypeError("fetch failed"));
    expect((await prebookRoom("offer-12345678")).status).toBe(503);
    vi.stubEnv("FLITEL_API_URL", "");
    expect(await prebookRoom("offer-12345678")).toMatchObject({
      status: 503,
      body: { error: { code: "HOTELS_UNAVAILABLE" } },
    });
  });
});

describe("hotel booking call", () => {
  it("passes the backend's answer through unchanged", async () => {
    const request = stubBackend(Response.json({ data: { bookingId: "bk_1" } }));
    expect(await createHotelBooking({ attemptId: "a" })).toEqual({
      status: 200,
      body: { data: { bookingId: "bk_1" } },
    });
    expect(request).toHaveBeenCalledWith(
      `${backend}/api/hotel-bookings`,
      expect.objectContaining({ method: "POST", cache: "no-store", body: '{"attemptId":"a"}' }),
    );
  });

  it("treats an unreachable backend as checking, never failed", async () => {
    stubBackend(new TypeError("fetch failed"));
    expect(await createHotelBooking({})).toEqual({ status: 202, body: { data: { status: "checking" } } });
  });

  it("answers 503 LITEAPI_NOT_CONFIGURED without a backend", async () => {
    stubBackend(Response.json({}));
    vi.stubEnv("FLITEL_API_URL", "");
    expect(await createHotelBooking({})).toMatchObject({
      status: 503,
      body: { error: { code: "LITEAPI_NOT_CONFIGURED" } },
    });
  });
});

describe("booking read-back", () => {
  it("fetches with the attempt reference and validates the booking", async () => {
    const request = stubBackend(Response.json({ data: booking }));
    expect(await fetchHotelBooking("bk_1", ref)).toEqual(booking);
    expect(request).toHaveBeenCalledWith(
      `${backend}/api/hotel-bookings/bk_1?ref=${ref}`,
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it.each([
    ["a malformed booking id", "../secret", ref],
    ["a short booking id", "ab", ref],
    ["a missing reference", "bk_1", ""],
    ["a non-UUID reference", "bk_1", "not-a-uuid"],
  ])("never fetches with %s", async (_name, bookingId, badRef) => {
    const request = stubBackend(Response.json({ data: booking }));
    await expect(fetchHotelBooking(bookingId, badRef)).rejects.toThrow(/find this booking/);
    expect(request).not.toHaveBeenCalled();
  });

  it("reports a 404 as not found and other failures as unavailable", async () => {
    stubBackend(Response.json({ error: { code: "BOOKING_NOT_FOUND", message: "x" } }, { status: 404 }));
    await expect(fetchHotelBooking("bk_1", ref)).rejects.toThrow(/find this booking/);
    stubBackend(Response.json({}, { status: 502 }));
    await expect(fetchHotelBooking("bk_1", ref)).rejects.toThrow(/load this booking/);
    stubBackend(Response.json({ data: { bookingId: "bk_1" } }));
    await expect(fetchHotelBooking("bk_1", ref)).rejects.toThrow(/load this booking/);
  });

  it("uses the load-failed message for read-back 400 and 504, not search wording", async () => {
    for (const status of [400, 504]) {
      stubBackend(Response.json({ error: { code: "X", message: "x" } }, { status }));
      await expect(fetchHotelBooking("bk_1", ref)).rejects.toThrow(/load this booking/);
    }
  });
});
