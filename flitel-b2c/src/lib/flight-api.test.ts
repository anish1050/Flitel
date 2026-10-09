import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  createBooking,
  fetchBooking,
  fetchFlightOffers,
  fetchFlightOffer,
  refreshSupplierOffer,
  streamFlightOffers,
} from "./flight-api";
import { supplierOffer } from "./duffel-offer.fixture";
import { createDefaultSearch } from "./flights";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("flight backend connection", () => {
  it("proxies search bytes before completion and propagates cancellation", async () => {
    vi.stubEnv("FLITEL_API_URL", "http://127.0.0.1:3001");
    const cancel = vi.fn();
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('{"type":"offers","offers":[]}\n'),
        );
      },
      cancel,
    });
    const request = vi.fn().mockResolvedValue(new Response(upstream));
    vi.stubGlobal("fetch", request);
    const controller = new AbortController();
    const response = await streamFlightOffers(
      createDefaultSearch(),
      controller.signal,
    );
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      '"offers"',
    );
    expect(request).toHaveBeenCalledWith(
      "http://127.0.0.1:3001/api/flights/search?stream=true",
      expect.objectContaining({ method: "POST", cache: "no-store" }),
    );
    controller.abort();
    expect(request.mock.calls[0][1].signal.aborted).toBe(true);
    await reader.cancel();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("uses samples only when the backend URL is absent", async () => {
    vi.stubEnv("FLITEL_API_URL", "");
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    expect(await fetchFlightOffers(createDefaultSearch())).toHaveLength(5);
    expect(request).not.toHaveBeenCalled();
  });

  it("sends the search to the backend without caching and accepts a genuine empty result", async () => {
    vi.stubEnv("FLITEL_API_URL", "http://127.0.0.1:3001");
    const request = vi.fn().mockResolvedValue(
      Response.json({
        data: {
          id: "orq_test",
          live_mode: false,
          offers: [],
          passengers: [],
        },
      }),
    );
    vi.stubGlobal("fetch", request);
    const search = createDefaultSearch();
    expect(await fetchFlightOffers(search)).toEqual([]);
    expect(request).toHaveBeenCalledWith(
      "http://127.0.0.1:3001/api/flights/search",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(search),
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("reports missing credentials and expired fares without returning samples", async () => {
    vi.stubEnv("FLITEL_API_URL", "http://127.0.0.1:3001");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: "DUFFEL_NOT_CONFIGURED",
              message: "Duffel test credentials are not configured yet.",
            },
          },
          { status: 503 },
        ),
      ),
    );
    await expect(fetchFlightOffers(createDefaultSearch())).rejects.toThrow(
      /not available yet/,
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: "OFFER_EXPIRED", message: "expired" } },
            { status: 410 },
          ),
        ),
    );
    await expect(
      fetchFlightOffer("off_test123", createDefaultSearch()),
    ).rejects.toThrow(/expired/);
  });
});

describe("refreshing a supplier offer", () => {
  const search = createDefaultSearch();

  it("posts the search and returns the same flight's new offer", async () => {
    vi.stubEnv("FLITEL_API_URL", "http://127.0.0.1:3001");
    const request = vi
      .fn()
      .mockResolvedValue(Response.json({ data: { ...supplierOffer, id: "off_new" } }));
    vi.stubGlobal("fetch", request);
    expect((await refreshSupplierOffer("off_old", search))?.id).toBe("off_new");
    expect(request).toHaveBeenCalledWith(
      "http://127.0.0.1:3001/api/flights/offers/off_old/refresh",
      expect.objectContaining({ method: "POST", cache: "no-store", body: JSON.stringify(search) }),
    );
  });

  it("answers undefined when the flight is gone", async () => {
    vi.stubEnv("FLITEL_API_URL", "http://127.0.0.1:3001");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ error: { code: "OFFER_UNAVAILABLE", message: "gone" } }, { status: 404 }),
      ),
    );
    expect(await refreshSupplierOffer("off_old", search)).toBeUndefined();
  });

  it("fails with a customer-safe message when the backend errors", async () => {
    vi.stubEnv("FLITEL_API_URL", "http://127.0.0.1:3001");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status: 502 })));
    await expect(refreshSupplierOffer("off_old", search)).rejects.toThrow(/could not be refreshed/);
  });

  it("never fetches for a malformed id", async () => {
    vi.stubEnv("FLITEL_API_URL", "http://127.0.0.1:3001");
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await expect(refreshSupplierOffer("../bookings", search)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});

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
