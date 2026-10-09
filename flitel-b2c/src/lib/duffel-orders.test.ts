import { describe, expect, it } from "vitest";
import { parseDuffelOrder } from "./duffel-orders";
import { supplierOffer } from "./duffel-offer.fixture";

const order = {
  id: "ord_example123",
  live_mode: false,
  booking_reference: "K7XQ2M",
  total_amount: "450.25",
  total_currency: "USD",
  slices: supplierOffer.slices,
  passengers: [
    { title: "ms", given_name: "Priya", family_name: "Sharma", email: "priya@example.com" },
    { title: "mr", given_name: "Rahul", family_name: "Sharma", email: "priya@example.com" },
  ],
};

describe("Duffel order mapping", () => {
  it("keeps the reference, exact total, travellers and itinerary", () => {
    expect(parseDuffelOrder(order)).toMatchObject({
      id: "ord_example123",
      bookingReference: "K7XQ2M",
      totalAmount: "450.25",
      currency: "USD",
      travellers: ["Ms Priya Sharma", "Mr Rahul Sharma"],
      email: "priya@example.com",
    });
    expect(parseDuffelOrder(order).slices).toHaveLength(2);
  });

  it("refuses live or incomplete orders", () => {
    for (const change of [{ live_mode: true }, { booking_reference: "" }, { passengers: [] }]) {
      expect(() => parseDuffelOrder({ ...order, ...change })).toThrow();
    }
  });
});
