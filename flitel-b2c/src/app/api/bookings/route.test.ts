import { describe, expect, it, vi } from "vitest";
const { createBooking } = vi.hoisted(() => ({ createBooking: vi.fn() }));
vi.mock("@/lib/flight-api", () => ({ createBooking }));
// Vitest has no "@/" alias here; the search route test resolves it the same way.
vi.mock("@/lib/request-body", () => import("../../../lib/request-body"));
import { POST } from "./route";

describe("booking proxy", () => {
  it("rejects an oversized body before forwarding it", async () => {
    const response = await POST(
      new Request("http://localhost/api/bookings", {
        method: "POST",
        body: "x".repeat(33 * 1024),
      }),
    );
    expect(response.status).toBe(413);
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("forwards the booking and returns the backend status", async () => {
    createBooking.mockResolvedValue({ status: 202, body: { data: { status: "checking" } } });
    const response = await POST(
      new Request("http://localhost/api/bookings", { method: "POST", body: '{"attemptId":"a"}' }),
    );
    expect(createBooking).toHaveBeenCalledWith({ attemptId: "a" });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ data: { status: "checking" } });
  });
});
