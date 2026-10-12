import { describe, expect, it } from "vitest";
import { fieldErrors } from "./booking";
import {
  classifyHotelBooking,
  clearHotelAttempt,
  guestSchema,
  markHotelAttemptChecking,
  readPendingHotelAttempt,
  savePendingHotelAttempt,
  type PendingHotelAttempt,
} from "./hotel-booking";

const guest = { firstName: "Asha", lastName: "Rao", email: "asha@example.com", phone: "+919876543210" };
const pending: PendingHotelAttempt = {
  attemptId: "7d1c1f0a-3b5e-4a39-9a6e-2f4f0c7b9d11",
  prebookId: "pb_1",
  transactionId: "tx_1",
  expectedTotal: 16200,
  expectedCurrency: "INR",
  holder: guest,
};

class FakeStorage {
  private values = new Map<string, string>();
  getItem = (key: string) => this.values.get(key) ?? null;
  setItem = (key: string, value: string) => void this.values.set(key, value);
  removeItem = (key: string) => void this.values.delete(key);
}
const fake = () => new FakeStorage() as unknown as Storage;
const throwing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
} as unknown as Storage;

describe("guest details", () => {
  it("accepts valid details", () => {
    expect(guestSchema.safeParse(guest).success).toBe(true);
  });

  it("explains each invalid field", () => {
    const result = guestSchema.safeParse({ firstName: "1", lastName: "", email: "nope", phone: "98765" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(result.error)).toEqual({
      firstName: "Use English letters as shown on the passport.",
      lastName: "Use English letters as shown on the passport.",
      email: "Enter a valid email address.",
      phone: "Use the international format, for example +919876543210.",
    });
  });
});

describe("pending attempt storage", () => {
  it("round-trips a pending attempt under a per-attempt key", () => {
    const storage = fake();
    savePendingHotelAttempt(storage, pending);
    expect(storage.getItem(`flitel-hotel:${pending.attemptId}`)).not.toBeNull();
    expect(readPendingHotelAttempt(storage, pending.attemptId)).toEqual({ state: "ready", pending });
  });

  it("persists exactly the pending fields, never an extra such as a secret key", () => {
    const storage = fake();
    const extra = { ...pending, secretKey: "sk_live", holder: { ...guest, nationality: "IN" } };
    savePendingHotelAttempt(storage, extra);
    const stored = JSON.parse(storage.getItem(`flitel-hotel:${pending.attemptId}`)!);
    expect(Object.keys(stored.pending).sort()).toEqual(
      ["attemptId", "expectedCurrency", "expectedTotal", "holder", "prebookId", "transactionId"],
    );
    expect(Object.keys(stored.pending.holder).sort()).toEqual(["email", "firstName", "lastName", "phone"]);
    expect(storage.getItem(`flitel-hotel:${pending.attemptId}`)).not.toContain("sk_live");
  });

  it("removes the guest details when the checking marker cannot be written", () => {
    const storage = fake();
    savePendingHotelAttempt(storage, pending);
    storage.setItem = () => {
      throw new Error("quota");
    };
    markHotelAttemptChecking(storage, pending.attemptId);
    expect(storage.getItem(`flitel-hotel:${pending.attemptId}`)).toBeNull();
  });

  it("replaces the guest details with a checking marker", () => {
    const storage = fake();
    savePendingHotelAttempt(storage, pending);
    markHotelAttemptChecking(storage, pending.attemptId);
    expect(readPendingHotelAttempt(storage, pending.attemptId)).toEqual({ state: "checking" });
    expect(storage.getItem(`flitel-hotel:${pending.attemptId}`)).not.toContain("asha@example.com");
  });

  it("clears an attempt and reads unknown attempts as undefined", () => {
    const storage = fake();
    savePendingHotelAttempt(storage, pending);
    clearHotelAttempt(storage, pending.attemptId);
    expect(readPendingHotelAttempt(storage, pending.attemptId)).toBeUndefined();
    expect(readPendingHotelAttempt(storage, "other")).toBeUndefined();
  });

  it("never throws when storage is missing or blocked", () => {
    for (const storage of [undefined, throwing]) {
      expect(() => savePendingHotelAttempt(storage, pending)).not.toThrow();
      expect(() => markHotelAttemptChecking(storage, pending.attemptId)).not.toThrow();
      expect(() => clearHotelAttempt(storage, pending.attemptId)).not.toThrow();
      expect(readPendingHotelAttempt(storage, pending.attemptId)).toBeUndefined();
    }
  });

  it("reads corrupt or wrong-shaped values as undefined", () => {
    const storage = fake();
    storage.setItem(`flitel-hotel:a`, "{not json");
    storage.setItem(`flitel-hotel:b`, JSON.stringify({ state: "ready", pending: { attemptId: "b" } }));
    expect(readPendingHotelAttempt(storage, "a")).toBeUndefined();
    expect(readPendingHotelAttempt(storage, "b")).toBeUndefined();
  });
});

describe("classifying a booking answer", () => {
  const error = (code: string) => ({ error: { code, message: "server text must not be shown" } });

  it("confirms only a 200 with a booking id", () => {
    expect(classifyHotelBooking(200, { data: { bookingId: "bk_1" } })).toEqual({
      kind: "confirmed",
      bookingId: "bk_1",
    });
    expect(classifyHotelBooking(200, { data: {} })).toEqual({ kind: "checking" });
    expect(classifyHotelBooking(200, { data: { bookingId: "" } })).toEqual({ kind: "checking" });
  });

  it.each([
    "BOOKING_REJECTED",
    "ROOM_UNAVAILABLE",
    "BOOKING_FAILED",
    "HOTELS_UNAVAILABLE",
    "BOOKINGS_UNAVAILABLE",
    "LITEAPI_NOT_CONFIGURED",
    "INVALID_BOOKING",
  ])("treats %s as failed with fixed refund wording", (code) => {
    const outcome = classifyHotelBooking(422, error(code));
    expect(outcome).toMatchObject({ kind: "failed", code });
    if (outcome.kind !== "failed") return;
    expect(outcome.message).not.toContain("server text");
    expect(outcome.message).toMatch(/refund/i);
    expect(outcome.message).toMatch(/reference/i);
  });

  it.each([
    ["a 202 checking answer", 202, { data: { status: "checking" } }],
    ["a 500 with an unknown code", 500, error("SOMETHING_NEW")],
    ["a 502 without a code", 502, { error: {} }],
    ["an HTML body", 502, null],
    ["an empty body", 200, undefined],
    ["a string body", 500, "Bad gateway"],
    ["a 200 carrying a failure code", 200, error("BOOKING_FAILED")],
    ["a 202 carrying a failure code", 202, error("ROOM_UNAVAILABLE")],
    ["an inherited property name: constructor", 500, error("constructor")],
    ["an inherited property name: toString", 500, error("toString")],
    ["an inherited property name: __proto__", 500, error("__proto__")],
    ["an inherited property name: hasOwnProperty", 500, error("hasOwnProperty")],
  ])("treats %s as checking", (_name, status, body) => {
    expect(classifyHotelBooking(status, body)).toEqual({ kind: "checking" });
  });
});
