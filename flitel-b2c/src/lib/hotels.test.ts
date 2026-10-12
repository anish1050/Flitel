import { describe, expect, it } from "vitest";
import {
  buildStayQuery,
  defaultStay,
  findDestination,
  hotelDestinations,
  nightsBetween,
  parseStayParams,
  prebookSchema,
} from "./hotels";

const today = "2026-10-12";
const valid = { destination: "goa", checkin: "2026-10-20", checkout: "2026-10-23", adults: "2" };

describe("hotel destinations", () => {
  it("finds a destination by id and has unique ids", () => {
    expect(findDestination("dubai")).toMatchObject({ countryCode: "AE", cityName: "Dubai" });
    expect(findDestination("atlantis")).toBeUndefined();
    expect(new Set(hotelDestinations.map(({ id }) => id)).size).toBe(hotelDestinations.length);
  });
});

describe("parsing a stay", () => {
  it("accepts valid parameters and turns adults into a number", () => {
    expect(parseStayParams(valid, today)).toEqual({
      destination: "goa",
      checkin: "2026-10-20",
      checkout: "2026-10-23",
      adults: 2,
    });
  });

  it("accepts check-in today", () => {
    expect(parseStayParams({ ...valid, checkin: today }, today).checkin).toBe(today);
  });

  it.each([
    ["unknown destination", { destination: "atlantis" }, /destination/i],
    ["missing destination", { destination: undefined }, /destination/i],
    ["array destination", { destination: ["goa", "dubai"] }, /destination/i],
    ["past check-in", { checkin: "2026-10-11" }, /today or later/i],
    ["not a date", { checkin: "next week" }, /check-in/i],
    ["missing checkout", { checkout: undefined }, /check-out/i],
    ["checkout on checkin", { checkout: "2026-10-20" }, /after check-in/i],
    ["checkout before checkin", { checkout: "2026-10-19" }, /after check-in/i],
    ["more than 30 nights", { checkout: "2026-11-20" }, /30 nights/],
    ["zero adults", { adults: "0" }, /adult/i],
    ["ten adults", { adults: "10" }, /adult/i],
    ["non-numeric adults", { adults: "two" }, /adult/i],
    ["array adults", { adults: ["1", "2"] }, /adult/i],
  ])("rejects %s with a customer-safe message", (_name, change, message) => {
    expect(() => parseStayParams({ ...valid, ...change }, today)).toThrow(message);
  });

  it("allows exactly 30 nights", () => {
    expect(parseStayParams({ ...valid, checkout: "2026-11-19" }, today).checkout).toBe("2026-11-19");
  });
});

describe("stay query", () => {
  it("round-trips through the parser", () => {
    const stay = parseStayParams(valid, today);
    const query = Object.fromEntries(new URLSearchParams(buildStayQuery(stay)));
    expect(query).toEqual({ destination: "goa", checkin: "2026-10-20", checkout: "2026-10-23", adults: "2" });
    expect(parseStayParams(query, today)).toEqual(stay);
  });

  it("counts nights across a month end", () => {
    expect(nightsBetween("2026-10-30", "2026-11-02")).toBe(3);
  });
});

describe("prebook response", () => {
  it("requires the fields the card form needs", () => {
    expect(prebookSchema.safeParse({ prebookId: "p" }).success).toBe(false);
  });
});

describe("default stay", () => {
  it("starts 14 days ahead for two nights and passes its own validation", () => {
    const stay = defaultStay(new Date(2026, 9, 12));
    expect(stay).toMatchObject({ checkin: "2026-10-26", checkout: "2026-10-28", destination: "mumbai" });
    expect(parseStayParams({ ...stay, adults: String(stay.adults) }, today)).toEqual(stay);
  });
});
