import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  fetchFlightOffers,
  fetchFlightOffer,
  streamFlightOffers,
} from "./flight-api";
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
