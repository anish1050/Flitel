import { describe, expect, it } from "vitest";
import {
  isNothingBooked,
  createBookingInput,
  createBookingSchema,
  fieldErrors,
  isAdultOn,
  clearPendingAttempt,
  readPendingAttempt,
  savePendingAttempt,
} from "./booking";

const today = "2026-10-09";
const filled = (documentsRequired = false) => {
  const input = createBookingInput(["pas_1"], documentsRequired);
  Object.assign(input.travellers[0], {
    title: "ms",
    givenName: "Priya",
    familyName: "Sharma",
    bornOn: "1990-04-12",
    gender: "f",
  });
  input.contact = { email: "priya@example.com", phone: "+919876543210" };
  return input;
};

describe("booking form validation", () => {
  it("starts empty with one traveller per fare passenger", () => {
    const input = createBookingInput(["pas_1", "pas_2"], true);
    expect(input.travellers.map((traveller) => traveller.id)).toEqual(["pas_1", "pas_2"]);
    expect(input.travellers[0].passport).toEqual({ number: "", issuingCountry: "", expiresOn: "" });
    expect(createBookingInput(["pas_1"], false).travellers[0].passport).toBeUndefined();
  });

  it("accepts complete details", () => {
    expect(createBookingSchema(false, today).safeParse(filled()).success).toBe(true);
  });

  it("reports each problem against its field", () => {
    const input = filled();
    input.travellers[0].givenName = "Pr1ya";
    input.travellers[0].bornOn = "2015-01-01";
    input.contact.phone = "98765";
    const result = createBookingSchema(false, today).safeParse(input);
    expect(result.success).toBe(false);
    expect(fieldErrors(result.error!)).toMatchObject({
      "travellers.0.givenName": "Use English letters as shown on the passport.",
      "travellers.0.bornOn": "Adult travellers must be 18 or older.",
      "contact.phone": "Use the international format, for example +919876543210.",
    });
  });

  it("requires a valid, unexpired passport only when the airline asks", () => {
    const input = filled(true);
    expect(createBookingSchema(true, today).safeParse(input).success).toBe(false);
    input.travellers[0].passport = { number: "Z1234567", issuingCountry: "IN", expiresOn: "2026-10-01" };
    const expired = createBookingSchema(true, today).safeParse(input);
    expect(fieldErrors(expired.error!)["travellers.0.passport.expiresOn"]).toBe(
      "The passport must not have expired.",
    );
    input.travellers[0].passport.expiresOn = "2031-01-01";
    expect(createBookingSchema(true, today).safeParse(input).success).toBe(true);
  });

  it("counts adult age by calendar date", () => {
    expect(isAdultOn("2008-10-09", today)).toBe(true);
    expect(isAdultOn("2008-10-10", today)).toBe(false);
  });
});

describe("isNothingBooked", () => {
  it("is true only for codes proving no order exists", () => {
    expect(isNothingBooked("PRICE_CHANGED")).toBe(true);
    expect(isNothingBooked(undefined)).toBe(false);
    expect(isNothingBooked("INTERNAL_ERROR")).toBe(false);
    expect(isNothingBooked("NOT_FOUND")).toBe(false);
  });
});

describe("pending attempt storage", () => {
  const fakeStorage = () => {
    const items = new Map<string, string>();
    return {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
    } as Storage;
  };

  it("saves, reads and clears the attempt reference per offer", () => {
    const storage = fakeStorage();
    savePendingAttempt(storage, "off_1", "attempt-1");
    expect(readPendingAttempt(storage, "off_1")).toBe("attempt-1");
    expect(readPendingAttempt(storage, "off_2")).toBeUndefined();
    clearPendingAttempt(storage, "off_1");
    expect(readPendingAttempt(storage, "off_1")).toBeUndefined();
  });

  it("never throws when storage is missing or broken", () => {
    const broken = new Proxy({}, { get: () => () => { throw new Error("blocked"); } }) as Storage;
    for (const storage of [undefined, broken]) {
      expect(() => savePendingAttempt(storage, "off_1", "a")).not.toThrow();
      expect(readPendingAttempt(storage, "off_1")).toBeUndefined();
      expect(() => clearPendingAttempt(storage, "off_1")).not.toThrow();
    }
  });
});
