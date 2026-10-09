import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bookingRequestSchema,
  buildDuffelOrder,
  findTravellerMismatch,
} from "./orders.js";
import type { FlightOffer } from "./flights.js";

const offer = {
  id: "off_example_123",
  live_mode: false,
  expires_at: "2026-09-30T12:30:00Z",
  total_amount: "550.25",
  total_currency: "GBP",
  slices: [{ id: "sli_outbound" }],
  passengers: [{ id: "pas_one", type: "adult" }],
} as FlightOffer;
const traveller = {
  id: "pas_one",
  title: "ms",
  givenName: "Priya",
  familyName: "Sharma",
  bornOn: "1990-04-12",
  gender: "f",
};
const request = {
  attemptId: "3b241101-e2bb-4255-8caf-4136c566a962",
  offerId: "off_example_123",
  expectedTotal: "550.25",
  expectedCurrency: "GBP",
  travellers: [traveller],
  contact: { email: "priya@example.com", phone: "+919876543210" },
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("booking request", () => {
  it("accepts complete traveller and contact details", () => {
    expect(bookingRequestSchema.safeParse(request).success).toBe(true);
  });

  it("rejects incomplete or malformed details", () => {
    for (const changes of [
      { attemptId: "not-a-uuid" },
      { expectedTotal: "5.5.5" },
      { expectedCurrency: "gbp" },
      { travellers: [] },
      { travellers: [{ ...traveller, givenName: "" }] },
      { travellers: [{ ...traveller, givenName: "Pr1ya" }] },
      { travellers: [{ ...traveller, title: "sir" }] },
      { travellers: [{ ...traveller, gender: "x" }] },
      { travellers: [{ ...traveller, bornOn: "2026-10-01" }] },
      {
        travellers: [
          { ...traveller, passport: { number: "ab 12", issuingCountry: "IN", expiresOn: "2030-01-01" } },
        ],
      },
      { contact: { email: "not-an-email", phone: "+919876543210" } },
      { contact: { email: "priya@example.com", phone: "9876543210" } },
    ]) {
      expect(
        bookingRequestSchema.safeParse({ ...request, ...changes }).success,
      ).toBe(false);
    }
  });
});

describe("Duffel order body", () => {
  it("pays the offer's own amount and maps every traveller", () => {
    const parsed = bookingRequestSchema.parse({
      ...request,
      travellers: [
        {
          ...traveller,
          passport: { number: "Z1234567", issuingCountry: "IN", expiresOn: "2031-05-01" },
        },
      ],
    });
    expect(
      buildDuffelOrder(parsed, { ...offer, total_amount: "600.00" }),
    ).toEqual({
      type: "instant",
      selected_offers: ["off_example_123"],
      payments: [{ type: "balance", amount: "600.00", currency: "GBP" }],
      passengers: [
        {
          id: "pas_one",
          title: "ms",
          gender: "f",
          given_name: "Priya",
          family_name: "Sharma",
          born_on: "1990-04-12",
          email: "priya@example.com",
          phone_number: "+919876543210",
          identity_documents: [
            {
              type: "passport",
              unique_identifier: "Z1234567",
              issuing_country_code: "IN",
              expires_on: "2031-05-01",
            },
          ],
        },
      ],
    });
  });

  it("requires travellers to match the fare and passports when the airline asks", () => {
    const parsed = bookingRequestSchema.parse(request);
    expect(findTravellerMismatch(parsed, offer)).toBeUndefined();
    expect(
      findTravellerMismatch(parsed, {
        ...offer,
        passengers: [{ id: "pas_other" }],
      }),
    ).toBe("Traveller details do not match this fare.");
    expect(
      findTravellerMismatch(parsed, {
        ...offer,
        passenger_identity_documents_required: true,
      }),
    ).toBe("Passport details are required for this flight.");
  });
});
