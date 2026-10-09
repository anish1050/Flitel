import { describe, expect, it } from "vitest";
import { parseDuffelOffer } from "./duffel-offers";
import { formatPrice } from "./flights";

import { airport, supplierOffer } from "./duffel-offer.fixture";

describe("Duffel offer mapping", () => {
  it("keeps the supplier journey total, currency, all slices and local flight times", () => {
    const offer = parseDuffelOffer(supplierOffer);
    expect(offer.price).toBe(450.25);
    expect(offer.currency).toBe("USD");
    expect(offer.priceScope).toBe("journey");
    expect(offer.passengerIds).toEqual(["pas_1", "pas_2"]);
    expect(offer.slices).toHaveLength(2);
    expect(offer.slices?.[0].segments).toHaveLength(2);
    expect(offer.departure).toBe("22:00");
    expect(offer.arrival).toBe("02:00");
    expect(offer.arrivalDayOffset).toBe(1);
    expect(offer.durationMinutes).toBe(540);
    expect(offer.stops).toBe(1);
    expect(offer.refundable).toBeNull();
    expect(offer.baggage).toContain("itinerary");
    expect(formatPrice(offer.price, offer.currency)).toContain("450.25");
    expect(formatPrice(0, "USD")).toContain("0");
    expect(formatPrice(1.234, "KWD")).toContain("1.234");
  });

  it("rejects malformed, live and expired offers rather than inventing values", () => {
    for (const change of [
      { total_amount: "not money" },
      { total_currency: "invalid" },
      { live_mode: true },
      { slices: [] },
    ]) {
      expect(() => parseDuffelOffer({ ...supplierOffer, ...change })).toThrow();
    }
    expect(() =>
      parseDuffelOffer({
        ...supplierOffer,
        expires_at: "2000-01-01T00:00:00Z",
      }),
    ).toThrow(/expired/i);
  });

  it("preserves unknown duration and baggage and includes stops within a segment", () => {
    const original = supplierOffer.slices[1];
    const offer = parseDuffelOffer({
      ...supplierOffer,
      slices: [
        {
          ...original,
          duration: null,
          segments: [
            {
              ...original.segments[0],
              passengers: [],
              stops: [{ airport: airport("AUH") }],
            },
          ],
        },
      ],
    });
    expect(offer.durationMinutes).toBeNull();
    expect(offer.stops).toBe(1);
    expect(offer.refundable).toBeNull();
  });
});
