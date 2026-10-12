import { describe, expect, it } from "vitest";
import type { PendingHotelAttempt } from "./hotel-booking";
import {
  buildHotelReturnUrl,
  describePrebookChanges,
  resolveReturnState,
  shouldKeepAttempt,
} from "./hotel-checkout";
import type { Prebook } from "./hotels";

const prebook: Prebook = {
  prebookId: "pb_1",
  transactionId: "tx_1",
  secretKey: "secret",
  hotelId: "lp1",
  checkin: "2026-10-20",
  checkout: "2026-10-22",
  price: { amount: 16200, currency: "INR" },
  priceDifferencePercent: 0,
  cancellationChanged: false,
  boardChanged: false,
  refundable: true,
};
const summary = { amount: 16200, currency: "INR" };
const pending: PendingHotelAttempt = {
  attemptId: "7d1c1f0a-3b5e-4a39-9a6e-2f4f0c7b9d11",
  prebookId: "pb_1",
  transactionId: "tx_1",
  expectedTotal: 16200,
  expectedCurrency: "INR",
  holder: { firstName: "Asha", lastName: "Rao", email: "asha@example.com", phone: "+919876543210" },
};

describe("buildHotelReturnUrl", () => {
  it("carries only the attempt, prebook and transaction ids", () => {
    const url = new URL(
      buildHotelReturnUrl("https://flitel.test", {
        attemptId: pending.attemptId,
        prebookId: "pb 1&x",
        transactionId: "tx_1",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://flitel.test/hotels/complete");
    expect([...url.searchParams.keys()].sort()).toEqual(["attempt", "pid", "tid"]);
    expect(url.searchParams.get("pid")).toBe("pb 1&x");
  });
});

describe("describePrebookChanges", () => {
  it("is empty when nothing changed", () => {
    expect(describePrebookChanges(prebook, summary)).toEqual([]);
  });

  it("states the price before and after", () => {
    const [change] = describePrebookChanges(
      { ...prebook, priceDifferencePercent: 5, price: { amount: 17010, currency: "INR" } },
      summary,
    );
    expect(change).toContain("₹16,200");
    expect(change).toContain("₹17,010");
  });

  it("still flags a price change whose amounts match the summary", () => {
    expect(describePrebookChanges({ ...prebook, priceDifferencePercent: -3 }, summary)).toHaveLength(1);
  });

  it("flags a price change from the amounts alone", () => {
    expect(describePrebookChanges({ ...prebook, price: { amount: 100, currency: "INR" } }, summary)).toHaveLength(1);
  });

  it("lists cancellation and board changes", () => {
    const changes = describePrebookChanges(
      { ...prebook, cancellationChanged: true, boardChanged: true },
      summary,
    );
    expect(changes).toHaveLength(2);
    expect(changes.join(" ")).toMatch(/cancellation/i);
    expect(changes.join(" ")).toMatch(/board|meal/i);
  });
});

describe("resolveReturnState", () => {
  const params = { attempt: pending.attemptId, pid: "pb_1", tid: "tx_1" };

  it("is missing without an attempt id or a stored attempt", () => {
    expect(resolveReturnState({ ...params, attempt: null }, undefined)).toEqual({ kind: "missing" });
    expect(resolveReturnState(params, undefined)).toEqual({ kind: "missing" });
  });

  it("is ready when the URL matches the stored attempt", () => {
    expect(resolveReturnState(params, { state: "ready", pending })).toEqual({ kind: "ready", pending });
  });

  it("treats a pid or tid mismatch as missing", () => {
    expect(resolveReturnState({ ...params, pid: "other" }, { state: "ready", pending })).toEqual({ kind: "missing" });
    expect(resolveReturnState({ ...params, tid: null }, { state: "ready", pending })).toEqual({ kind: "missing" });
  });

  it("keeps the checking marker", () => {
    expect(resolveReturnState(params, { state: "checking" })).toEqual({ kind: "checking" });
  });
});

describe("shouldKeepAttempt", () => {
  it("keeps the paid attempt until the answer is proven", () => {
    expect(shouldKeepAttempt({ kind: "checking" })).toBe(true);
    expect(shouldKeepAttempt({ kind: "confirmed", bookingId: "bk_1" })).toBe(false);
    expect(shouldKeepAttempt({ kind: "failed", code: "ROOM_UNAVAILABLE", message: "x" })).toBe(false);
  });
});
