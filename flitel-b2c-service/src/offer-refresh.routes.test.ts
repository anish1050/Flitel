import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "./index.js";

vi.mock("./mongodb.js", () => ({
  getDatabase: () => {
    throw new Error("refresh must not touch MongoDB");
  },
}));

const search = {
  from: "BOM",
  to: "DEL",
  depart: "2026-10-15",
  travellers: 1,
  cabin: "economy",
  trip: "one-way",
};
const makeOffer = (id: string, total: string, brand: string, expiresAt = "2026-10-09T13:00:00Z") => ({
  id,
  live_mode: false,
  expires_at: expiresAt,
  total_amount: total,
  total_currency: "INR",
  slices: [
    {
      fare_brand_name: brand,
      segments: [
        {
          marketing_carrier: { iata_code: "AI" },
          marketing_carrier_flight_number: "9487",
          departing_at: "2026-10-15T14:45:00",
        },
      ],
    },
  ],
  passengers: [{ id: "pas_one", type: "adult" }],
});
// Past expires_at on purpose: refresh must still read it.
const original = makeOffer("off_original", "5000.00", "Economy Value", "2026-10-09T10:00:00Z");
const fetchMock = vi.fn<typeof fetch>();

function mockDuffel(freshOffers: unknown[]) {
  fetchMock.mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === "/air/offers/off_original") return Response.json({ data: original });
    if (path === "/air/offer_requests")
      return Response.json({
        data: { id: "orq_fresh", live_mode: false, offers: freshOffers, passengers: [{ id: "pas_one" }] },
      });
    throw new Error(`Unexpected Duffel call ${path}`);
  });
}
const refresh = (id = "off_original", body: unknown = search) =>
  app.request(`/api/flights/offers/${id}/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
  vi.stubEnv("DUFFEL_ACCESS_TOKEN", "duffel_test_example");
  vi.stubGlobal("fetch", fetchMock.mockReset());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("POST /api/flights/offers/:id/refresh", () => {
  it("returns the same flight as a new offer, even when the original has lapsed", async () => {
    mockDuffel([makeOffer("off_new", "5100.00", "Economy Value")]);
    const response = await refresh();
    expect(response.status).toBe(200);
    expect((await response.json()).data.id).toBe("off_new");
  });

  it("prefers the same fare brand over a cheaper one", async () => {
    mockDuffel([
      makeOffer("off_light", "4000.00", "Economy Light"),
      makeOffer("off_value", "5200.00", "Economy Value"),
    ]);
    expect((await (await refresh()).json()).data.id).toBe("off_value");
  });

  it("answers 404 OFFER_UNAVAILABLE when the flight is gone", async () => {
    const otherFlight = makeOffer("off_other", "5000.00", "Economy Value");
    otherFlight.slices[0].segments[0].marketing_carrier_flight_number = "9488";
    mockDuffel([otherFlight, makeOffer("off_original", "5000.00", "Economy Value")]);
    const response = await refresh();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "OFFER_UNAVAILABLE",
        message: "This flight is no longer available. Please search again.",
      },
    });
  });

  it("rejects an invalid id or search before any Duffel call", async () => {
    expect((await refresh("emirates")).status).toBe(400);
    const invalid = await refresh("off_original", { ...search, to: "BOM" });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe("INVALID_SEARCH");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
