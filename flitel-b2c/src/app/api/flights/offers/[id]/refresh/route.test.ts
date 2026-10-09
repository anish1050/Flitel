import { beforeEach, describe, expect, it, vi } from "vitest";
import { supplierOffer } from "../../../../../../lib/duffel-offer.fixture";
import { parseDuffelOffer } from "../../../../../../lib/duffel-offers";
import { createDefaultSearch } from "../../../../../../lib/flights";
const { refreshSupplierOffer } = vi.hoisted(() => ({ refreshSupplierOffer: vi.fn() }));
vi.mock("@/lib/flight-api", () => ({ refreshSupplierOffer }));
// Vitest has no "@/" alias here; the other route tests resolve it the same way.
vi.mock("@/lib/request-body", () => import("../../../../../../lib/request-body"));
vi.mock("@/lib/flights", () => import("../../../../../../lib/flights"));
vi.mock("@/lib/booking", () => import("../../../../../../lib/booking"));
import { POST } from "./route";

const call = (body: string) =>
  POST(new Request("http://localhost/api/flights/offers/off_1/refresh", { method: "POST", body }), {
    params: Promise.resolve({ id: "off_1" }),
  });

beforeEach(() => {
  refreshSupplierOffer.mockReset();
});

describe("fare refresh proxy", () => {
  it("rejects an oversized body", async () => {
    expect((await call("x".repeat(5000))).status).toBe(413);
    expect(refreshSupplierOffer).not.toHaveBeenCalled();
  });

  it("rejects an invalid search without calling the backend", async () => {
    const response = await call('{"from":"nowhere"}');
    expect(response.status).toBe(400);
    expect(refreshSupplierOffer).not.toHaveBeenCalled();
  });

  it("returns the bookable offer for the same flight", async () => {
    refreshSupplierOffer.mockResolvedValue(parseDuffelOffer({ ...supplierOffer, id: "off_new" }));
    const response = await call(JSON.stringify(createDefaultSearch()));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).data.id).toBe("off_new");
  });

  it("answers OFFER_UNAVAILABLE when the flight is gone", async () => {
    refreshSupplierOffer.mockResolvedValue(undefined);
    const response = await call(JSON.stringify(createDefaultSearch()));
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("OFFER_UNAVAILABLE");
  });

  it("answers 502 when the refresh fails", async () => {
    refreshSupplierOffer.mockImplementation(async () => { throw new Error("down"); });
    const response = await call(JSON.stringify(createDefaultSearch()));
    expect(response.status).toBe(502);
  });
});
