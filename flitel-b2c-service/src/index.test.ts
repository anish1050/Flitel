import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "./index.js";

const { pingMongo, findCachedSearch, saveCachedSearch } = vi.hoisted(() => ({
  pingMongo: vi.fn(),
  findCachedSearch: vi.fn(),
  saveCachedSearch: vi.fn(),
}));
vi.mock("./mongodb.js", () => ({
  getDatabase: () => ({
    command: pingMongo,
    collection: () => ({
      findOne: findCachedSearch,
      replaceOne: saveCachedSearch,
    }),
  }),
}));

const cachedSearches = new Map<
  string,
  { _id: string; expiresAt: Date; data: unknown }
>();

const search = {
  from: "BOM",
  to: "DXB",
  depart: "2026-10-14",
  returnDate: "2026-10-21",
  travellers: 2,
  cabin: "economy",
  trip: "round-trip",
};
const offer = {
  id: "off_example_123",
  live_mode: false,
  expires_at: "2026-09-30T12:30:00Z",
  total_amount: "550.25",
  total_currency: "GBP",
  slices: [{ id: "sli_outbound" }, { id: "sli_return" }],
  passengers: [
    { id: "pas_one", type: "adult" },
    { id: "pas_two", type: "adult" },
  ],
};
const offerRequest = {
  id: "orq_example123",
  live_mode: false,
  offers: [offer],
  passengers: offer.passengers,
};
const fetchMock = vi.fn<typeof fetch>();

function searchFlights(body: unknown = search, stream = false) {
  return app.request(`/api/flights/search${stream ? "?stream=true" : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  cachedSearches.clear();
  findCachedSearch.mockReset().mockImplementation(async (filter) => {
    const cached = cachedSearches.get(filter._id);
    if (cached && filter.expiresAt && cached.expiresAt <= filter.expiresAt.$gt)
      return null;
    return cached ?? null;
  });
  saveCachedSearch.mockReset().mockImplementation(async (_filter, document) => {
    cachedSearches.set(document._id, document);
    return { acknowledged: true };
  });
  pingMongo.mockReset().mockResolvedValue({ ok: 1 });
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

describe("flight API", () => {
  it("starts without credentials and refuses unconfigured or live tokens", async () => {
    for (const token of ["", "duffel_live_example", "invalid"]) {
      vi.stubEnv("DUFFEL_ACCESS_TOKEN", token);
      const health = await app.request("/api/health");
      expect(await health.json()).toEqual({
        status: "ok",
        duffelConfigured: false,
        mongodbConnected: true,
        mode: "test",
      });
      const response = await searchFlights();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: {
          code: "DUFFEL_NOT_CONFIGURED",
          message: "Flight search needs a Duffel test access token.",
        },
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports database readiness without leaking connection errors", async () => {
    const ready = await app.request("/api/health");
    expect(ready.status).toBe(200);
    expect((await ready.json()).mongodbConnected).toBe(true);
    expect(pingMongo).toHaveBeenCalledWith({ ping: 1 });

    pingMongo.mockRejectedValue(
      new Error("mongodb://private-user:secret@host"),
    );
    const unavailable = await app.request("/api/health");
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({
      status: "degraded",
      duffelConfigured: true,
      mongodbConnected: false,
      mode: "test",
    });
    vi.stubEnv("DUFFEL_ACCESS_TOKEN", "");
    expect((await searchFlights()).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid searches before calling Duffel", async () => {
    for (const changes of [
      { to: "BOM" },
      { from: "bom" },
      { to: "DUBAI" },
      { depart: "2026-09-29" },
      { depart: "2027-02-29" },
      { travellers: 0 },
      { travellers: 10 },
      { travellers: "2" },
      { returnDate: undefined },
      { returnDate: "2026-10-13" },
    ]) {
      const response = await searchFlights({ ...search, ...changes });
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_SEARCH");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and oversized bodies", async () => {
    const invalid = await app.request("/api/flights/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe("INVALID_SEARCH");
    const oversized = await searchFlights({
      ...search,
      unused: "x".repeat(5000),
    });
    expect(oversized.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends both slices and adult passengers and preserves the supplier total", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: offerRequest }));
    const response = await searchFlights();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: offerRequest });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=10000",
    );
    expect(options?.headers).toMatchObject({
      "Duffel-Version": "v2",
      Authorization: "Bearer duffel_test_example",
    });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options?.body as string)).toEqual({
      data: {
        slices: [
          { origin: "BOM", destination: "DXB", departure_date: "2026-10-14" },
          { origin: "DXB", destination: "BOM", departure_date: "2026-10-21" },
        ],
        passengers: [{ type: "adult" }, { type: "adult" }],
        cabin_class: "economy",
      },
    });
  });

  it("sends only the outbound slice for a one-way search", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ data: { ...offerRequest, offers: [] } }),
    );
    const response = await searchFlights({
      ...search,
      trip: "one-way",
      returnDate: undefined,
    });
    expect(response.status).toBe(200);
    expect(
      JSON.parse(fetchMock.mock.calls[0][1]?.body as string).data.slices,
    ).toHaveLength(1);
    expect((await response.json()).data.offers).toEqual([]);
  });

  it("returns safe supplier failures without exposing upstream bodies", async () => {
    for (const [upstreamStatus, expectedStatus] of [
      [401, 503],
      [429, 503],
      [422, 422],
      [500, 502],
    ]) {
      fetchMock.mockResolvedValue(
        Response.json(
          { secret: "private-supplier-detail" },
          { status: upstreamStatus },
        ),
      );
      const response = await searchFlights();
      expect(response.status).toBe(expectedStatus);
      expect(await response.text()).not.toContain("private-supplier-detail");
    }
    fetchMock.mockRejectedValue(
      new DOMException("private-timeout-detail", "TimeoutError"),
    );
    const timedOut = await searchFlights();
    expect(timedOut.status).toBe(504);
    expect((await timedOut.json()).error.code).toBe("DUFFEL_TIMEOUT");
  });

  it("rejects malformed and live supplier responses", async () => {
    for (const data of [
      {},
      { ...offerRequest, live_mode: true },
      { ...offerRequest, offers: [{ ...offer, live_mode: true }] },
    ]) {
      fetchMock.mockResolvedValue(Response.json({ data }));
      const response = await searchFlights();
      expect(response.status).toBe(502);
      expect((await response.json()).error.code).toBe(
        "DUFFEL_INVALID_RESPONSE",
      );
    }
  });

  it("retrieves an offer unchanged and rejects unavailable or expired offers", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ data: offer }));
    const response = await app.request("/api/flights/offers/off_example_123");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: offer });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.duffel.com/air/offers/off_example_123",
    );
    fetchMock.mockResolvedValueOnce(
      Response.json({ data: { ...offer, expires_at: "2026-09-30T11:59:59Z" } }),
    );
    expect(
      (await app.request("/api/flights/offers/off_example_123")).status,
    ).toBe(410);
    fetchMock.mockResolvedValueOnce(
      Response.json({ errors: [] }, { status: 404 }),
    );
    expect(
      (await app.request("/api/flights/offers/off_example_123")).status,
    ).toBe(410);
    expect((await app.request("/api/flights/offers/emirates")).status).toBe(
      400,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("asks for a new search when Duffel reports an expired offer with HTTP 422", async () => {
    for (const code of ["offer_expired", "offer_no_longer_available"]) {
      fetchMock.mockResolvedValue(
        Response.json(
          { errors: [{ code, message: "private-supplier-detail" }] },
          { status: 422 },
        ),
      );
      const response = await app.request("/api/flights/offers/off_example_123");
      expect(response.status).toBe(410);
      expect(await response.json()).toEqual({
        error: {
          code: "OFFER_UNAVAILABLE",
          message: "This offer is no longer available. Please search again.",
        },
      });
    }
  });

  it("allows only the configured frontend origin", async () => {
    for (const [origin, expected] of [
      ["http://127.0.0.1:3000", "http://127.0.0.1:3000"],
      ["https://other.example", null],
    ]) {
      const response = await app.request("/api/flights/search", {
        method: "OPTIONS",
        headers: { Origin: origin!, "Access-Control-Request-Method": "POST" },
      });
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        expected,
      );
    }
  });

  it("reuses identical searches while preserving price and passenger identities", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({ data: offerRequest }),
    );
    const first = await searchFlights();
    const second = await searchFlights();
    expect(first.headers.get("X-Flight-Cache")).toBe("MISS");
    expect(second.headers.get("X-Flight-Cache")).toBe("HIT");
    expect(await second.json()).toEqual({ data: offerRequest });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(saveCachedSearch).toHaveBeenCalledTimes(1);
    const stored = [...cachedSearches.values()][0];
    expect(stored.expiresAt).toEqual(new Date("2026-09-30T12:02:00Z"));
    expect(JSON.stringify(stored)).not.toContain("duffel_test_example");
  });

  it("separates every search field and credentials but ignores an unused one-way return date", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({ data: offerRequest }),
    );
    const variations = [
      {},
      { from: "DEL" },
      { to: "SIN" },
      { depart: "2026-10-15" },
      { returnDate: "2026-10-22" },
      { travellers: 3 },
      { cabin: "business" },
      { trip: "one-way" },
    ];
    for (const changes of variations)
      expect((await searchFlights({ ...search, ...changes })).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(variations.length);
    expect(
      (
        await searchFlights({
          ...search,
          trip: "one-way",
          returnDate: "2026-10-25",
        })
      ).headers.get("X-Flight-Cache"),
    ).toBe("HIT");
    vi.stubEnv("DUFFEL_ACCESS_TOKEN", "duffel_test_rotated");
    expect((await searchFlights()).headers.get("X-Flight-Cache")).toBe("MISS");
    const lookupCount = findCachedSearch.mock.calls.length;
    vi.stubEnv("DUFFEL_ACCESS_TOKEN", "");
    expect((await searchFlights()).status).toBe(503);
    expect(findCachedSearch).toHaveBeenCalledTimes(lookupCount);
  });

  it("expires cache entries before offers expire even while TTL deletion is delayed", async () => {
    const expiring = {
      ...offerRequest,
      offers: [{ ...offer, expires_at: "2026-09-30T12:01:30Z" }],
    };
    fetchMock.mockImplementation(async () => Response.json({ data: expiring }));
    await searchFlights();
    expect([...cachedSearches.values()][0].expiresAt).toEqual(
      new Date("2026-09-30T12:01:00Z"),
    );
    vi.setSystemTime(new Date("2026-09-30T12:01:01Z"));
    expect((await searchFlights()).headers.get("X-Flight-Cache")).toBe(
      "BYPASS",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bypasses cache for empty, nearly expired, oversized and failed database operations", async () => {
    for (const offers of [
      [],
      [{ ...offer, expires_at: "2026-09-30T12:00:29Z" }],
      [{ ...offer, padding: "x".repeat(16 * 1024 * 1024) }],
    ]) {
      fetchMock.mockImplementation(async () =>
        Response.json({ data: { ...offerRequest, offers } }),
      );
      const response = await searchFlights();
      expect(response.status).toBe(200);
      expect(response.headers.get("X-Flight-Cache")).toBe("BYPASS");
    }
    expect(saveCachedSearch).not.toHaveBeenCalled();
    fetchMock.mockImplementation(async () =>
      Response.json({ data: offerRequest }),
    );
    findCachedSearch.mockRejectedValueOnce(new Error("database down"));
    expect((await searchFlights()).headers.get("X-Flight-Cache")).toBe(
      "BYPASS",
    );
    saveCachedSearch.mockRejectedValueOnce(new Error("write timeout"));
    expect((await searchFlights()).headers.get("X-Flight-Cache")).toBe(
      "BYPASS",
    );
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("shares simultaneous searches and always refreshes selected offer details", async () => {
    let finishSearch!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        finishSearch = resolve;
      }),
    );
    const requests = [searchFlights(), searchFlights()];
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    finishSearch(Response.json({ data: offerRequest }));
    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockImplementation(async () => Response.json({ data: offer }));
    await app.request("/api/flights/offers/off_example_123");
    await app.request("/api/flights/offers/off_example_123");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("streams the first batch before completion and caches only deduplicated complete results", async () => {
    const batch = {
      id: offerRequest.id,
      live_mode: false,
      remaining_batches: 2,
      total_batches: 2,
      client_key: "private-client-key",
    };
    let finishBatch!: (response: Response) => void;
    fetchMock
      .mockResolvedValueOnce(Response.json({ data: batch }))
      .mockResolvedValueOnce(
        Response.json({
          data: { ...batch, remaining_batches: 1, offers: [offer, offer] },
        }),
      )
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          finishBatch = resolve;
        }),
      );
    const response = await searchFlights(search, true);
    expect(response.headers.get("Content-Type")).toContain(
      "application/x-ndjson",
    );
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(JSON.parse(first)).toEqual({ type: "offers", offers: [offer] });
    expect(saveCachedSearch).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const secondOffer = { ...offer, id: "off_second" };
    finishBatch(
      Response.json({
        data: { ...batch, remaining_batches: 0, offers: [offer, secondOffer] },
      }),
    );
    let remaining = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      remaining += new TextDecoder().decode(chunk.value);
    }
    expect(
      remaining
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toEqual([
      { type: "offers", offers: [secondOffer] },
      { type: "complete" },
    ]);
    expect(first + remaining).not.toContain("private-client-key");
    expect((await searchFlights()).headers.get("X-Flight-Cache")).toBe("HIT");
    const cachedStream = await searchFlights(search, true);
    expect(cachedStream.headers.get("X-Flight-Cache")).toBe("HIT");
    expect(
      (await cachedStream.text())
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toEqual([
      { type: "offers", offers: [offer, secondOffer] },
      { type: "complete" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns a safe stream error and never caches partial results", async () => {
    const batch = {
      id: offerRequest.id,
      live_mode: false,
      remaining_batches: 1,
      total_batches: 2,
    };
    fetchMock
      .mockResolvedValueOnce(Response.json({ data: batch }))
      .mockResolvedValueOnce(
        Response.json({ data: { ...batch, offers: [offer] } }),
      )
      .mockRejectedValueOnce(new Error("private-network-detail"));
    const response = await searchFlights(search, true);
    const lines = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines[0]).toEqual({ type: "offers", offers: [offer] });
    expect(lines[1]).toEqual({
      type: "error",
      message: "Flight search could not be completed. Please try again.",
    });
    expect(saveCachedSearch).not.toHaveBeenCalled();
  });

  it("cancels supplier polling when the stream reader disconnects", async () => {
    const batch = {
      id: offerRequest.id,
      live_mode: false,
      remaining_batches: 1,
      total_batches: 2,
    };
    let pollingSignal: AbortSignal | undefined;
    fetchMock
      .mockResolvedValueOnce(Response.json({ data: batch }))
      .mockResolvedValueOnce(
        Response.json({ data: { ...batch, offers: [offer] } }),
      )
      .mockImplementationOnce(async (_url, options) => {
        pollingSignal = options!.signal!;
        return new Promise<Response>((_resolve, reject) =>
          pollingSignal!.addEventListener(
            "abort",
            () => reject(new DOMException("cancelled", "AbortError")),
            { once: true },
          ),
        );
      });
    const response = await searchFlights(search, true);
    const reader = response.body!.getReader();
    await reader.read();
    await vi.waitFor(() => expect(pollingSignal).toBeDefined());
    await reader.cancel();
    await vi.waitFor(() => expect(pollingSignal!.aborted).toBe(true));
    expect(saveCachedSearch).not.toHaveBeenCalled();
  });

  it("keeps simultaneous streams independent when one customer disconnects", async () => {
    let created = 0;
    fetchMock.mockImplementation(async (url, options) => {
      if (options?.method === "POST")
        return Response.json({
          data: {
            id: `orq_stream_${++created}`,
            live_mode: false,
            remaining_batches: 1,
          },
        });
      if (String(url).includes("orq_stream_1"))
        return new Promise<Response>((_resolve, reject) =>
          options!.signal!.addEventListener(
            "abort",
            () => reject(new DOMException("cancelled", "AbortError")),
            { once: true },
          ),
        );
      return Response.json({
        data: {
          id: "orq_stream_2",
          live_mode: false,
          remaining_batches: 0,
          offers: [offer],
        },
      });
    });
    const first = await searchFlights(search, true);
    const second = await searchFlights(search, true);
    await first.body!.cancel();
    const lines = (await second.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines).toEqual([
      { type: "offers", offers: [offer] },
      { type: "complete" },
    ]);
    expect(created).toBe(2);
    expect(saveCachedSearch).toHaveBeenCalledTimes(1);
  });
});
