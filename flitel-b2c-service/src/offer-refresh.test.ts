import { describe, expect, it } from "vitest";
import { findSameFlight, flightKey } from "./offer-refresh.js";
import type { FlightOffer } from "./flights.js";

const segment = (carrier = "AI", number = "9487", departing = "2026-10-15T14:45:00") => ({
  marketing_carrier: { iata_code: carrier },
  marketing_carrier_flight_number: number,
  departing_at: departing,
});
const makeOffer = (changes: Record<string, unknown> = {}, brand?: string): FlightOffer =>
  ({
    id: "off_original",
    live_mode: false,
    expires_at: "2026-10-09T12:30:00Z",
    total_amount: "100.00",
    total_currency: "GBP",
    slices: [{ segments: [segment()], fare_brand_name: brand ?? null }],
    passengers: [{ id: "pas_one" }],
    ...changes,
  }) as FlightOffer;

describe("flightKey", () => {
  it("joins segments with | and slices with ' / '", () => {
    const offer = makeOffer({
      slices: [
        { segments: [segment(), segment("EK", "501", "2026-10-15T20:10:00")] },
        { segments: [segment("AI", "9488", "2026-10-21T01:00:00")] },
      ],
    });
    expect(flightKey(offer)).toBe(
      "AI9487@2026-10-15T14:45|EK501@2026-10-15T20:10 / AI9488@2026-10-21T01:00",
    );
  });

  it("yields no key for unreadable slices", () => {
    expect(flightKey(makeOffer({ slices: [{ id: "sli_only" }] }))).toBeUndefined();
  });
});

describe("findSameFlight", () => {
  const original = makeOffer({}, "Economy Value");

  it("prefers the same fare brand over a cheaper other brand", () => {
    const cheaper = makeOffer({ id: "off_cheap", total_amount: "80.00" }, "Economy Light");
    const sameBrand = makeOffer({ id: "off_brand", total_amount: "120.00" }, "Economy Value");
    expect(findSameFlight(original, [cheaper, sameBrand])?.id).toBe("off_brand");
  });

  it("falls back to the cheapest when no brand matches", () => {
    const dearer = makeOffer({ id: "off_dear", total_amount: "150.00" }, "Flex");
    const cheaper = makeOffer({ id: "off_cheap", total_amount: "90.00" }, "Light");
    expect(findSameFlight(original, [dearer, cheaper])?.id).toBe("off_cheap");
  });

  it("ignores other flights, currencies and the same id", () => {
    const candidates = [
      makeOffer({ id: "off_number", slices: [{ segments: [segment("AI", "9488")] }] }),
      makeOffer({ id: "off_minute", slices: [{ segments: [segment("AI", "9487", "2026-10-15T14:46:00")] }] }),
      makeOffer({ id: "off_currency", total_currency: "USD" }),
      makeOffer({ id: "off_original" }),
    ];
    expect(findSameFlight(original, candidates)).toBeUndefined();
  });

  it("returns undefined when the original has no readable key", () => {
    const unreadable = makeOffer({ slices: [{ id: "x" }] });
    expect(findSameFlight(unreadable, [makeOffer({ id: "off_other" })])).toBeUndefined();
  });
});
