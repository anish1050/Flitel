import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import {
  buildSearchQuery,
  createDefaultSearch,
  createDemoOffers,
  parseSearchParams,
  searchSchema,
  type FlightSearch,
} from "./flights";

const search: FlightSearch = {
  from: "BOM",
  to: "DXB",
  depart: "2026-10-14",
  returnDate: "2026-10-21",
  travellers: 1,
  cabin: "economy",
  trip: "round-trip",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 30, 0, 15));
});
afterEach(() => vi.useRealTimers());

describe("flight search", () => {
  it("creates a valid local-date search two weeks ahead", () => {
    expect(createDefaultSearch()).toEqual(search);
    expect(searchSchema.parse(createDefaultSearch())).toEqual(search);
  });

  it("rejects unknown or identical airports and invalid traveller counts", () => {
    for (const change of [
      { from: "ZZZ" },
      { to: "ZZZ" },
      { to: "BOM" },
      { travellers: 0 },
      { travellers: 10 },
      { travellers: 1.5 },
    ]) {
      expect(searchSchema.safeParse({ ...search, ...change }).success).toBe(
        false,
      );
    }
    expect(searchSchema.safeParse({ ...search, travellers: 9 }).success).toBe(
      true,
    );
  });

  it("accepts real future dates and rejects past or impossible calendar dates", () => {
    for (const depart of [
      "2026-09-29",
      "2026-02-30",
      "2027-02-29",
      "2026-13-01",
      "10/14/2026",
    ]) {
      expect(searchSchema.safeParse({ ...search, depart }).success).toBe(false);
    }
    expect(
      searchSchema.safeParse({ ...search, depart: "2026-09-30" }).success,
    ).toBe(true);
    expect(
      searchSchema.safeParse({
        ...search,
        depart: "2028-02-29",
        returnDate: "2028-03-01",
      }).success,
    ).toBe(true);
  });

  it("requires a return date on or after departure only for round trips", () => {
    for (const returnDate of [undefined, "", "2026-10-13", "2026-11-31"]) {
      expect(searchSchema.safeParse({ ...search, returnDate }).success).toBe(
        false,
      );
    }
    expect(
      searchSchema.safeParse({ ...search, returnDate: search.depart }).success,
    ).toBe(true);
    expect(
      searchSchema.safeParse({
        ...search,
        trip: "one-way",
        returnDate: undefined,
      }).success,
    ).toBe(true);
  });

  it("round-trips URL fields and rejects incomplete or repeated query fields", () => {
    const params = {
      from: "BOM",
      to: "DXB",
      depart: "2026-10-14",
      returnDate: "2026-10-21",
      travellers: "1",
      cabin: "economy",
      trip: "round-trip",
    };
    expect(parseSearchParams(params)).toEqual(search);
    expect(
      Object.fromEntries(new URLSearchParams(buildSearchQuery(search))),
    ).toEqual(params);
    expect(() =>
      parseSearchParams({ ...params, from: ["BOM", "DEL"] }),
    ).toThrow(ZodError);
    expect(() =>
      parseSearchParams({ ...params, travellers: ["1", "2"] }),
    ).toThrow(ZodError);
    expect(() => parseSearchParams({ ...params, cabin: undefined })).toThrow(
      ZodError,
    );
    expect(
      new URLSearchParams(buildSearchQuery({ ...search, trip: "one-way" })).has(
        "returnDate",
      ),
    ).toBe(false);
  });

  it("returns five deterministic sample offers priced per traveller for the whole journey", () => {
    const oneWay = createDemoOffers({ ...search, trip: "one-way" });
    const roundTrip = createDemoOffers(search);
    expect(roundTrip).toHaveLength(5);
    expect(roundTrip).toEqual(createDemoOffers(search));
    expect(new Set(roundTrip.map((offer) => offer.price)).size).toBe(5);
    expect(new Set(roundTrip.map((offer) => offer.airline)).size).toBe(5);
    expect(new Set(roundTrip.map((offer) => offer.durationMinutes)).size).toBe(
      5,
    );
    expect(roundTrip.map((offer) => offer.price)).toEqual(
      oneWay.map((offer) => offer.price * 2),
    );
    expect(
      createDemoOffers({ ...search, travellers: 3 }).map(
        (offer) => offer.price,
      ),
    ).toEqual(roundTrip.map((offer) => offer.price));
    expect(
      createDemoOffers({ ...search, cabin: "business" })[0].price,
    ).toBeGreaterThan(roundTrip[0].price);
  });
});
