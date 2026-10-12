import { beforeEach, describe, expect, it, vi } from "vitest";
const { createHotelBooking } = vi.hoisted(() => ({ createHotelBooking: vi.fn() }));
vi.mock("@/lib/hotel-api", () => ({ createHotelBooking }));
// Vitest has no "@/" alias here; the booking route test resolves it the same way.
vi.mock("@/lib/request-body", () => import("../../../lib/request-body"));
import { POST } from "./route";

const post = (body: string) =>
  POST(new Request("http://localhost/api/hotel-bookings", { method: "POST", body }));

describe("hotel booking proxy", () => {
  beforeEach(() => createHotelBooking.mockReset());

  it("rejects an oversized body before forwarding it", async () => {
    const response = await post("x".repeat(9 * 1024));
    expect(response.status).toBe(413);
    expect(createHotelBooking).not.toHaveBeenCalled();
  });

  it("forwards the booking and returns the backend status uncached", async () => {
    createHotelBooking.mockResolvedValue({ status: 202, body: { data: { status: "checking" } } });
    const response = await post('{"attemptId":"a"}');
    expect(createHotelBooking).toHaveBeenCalledWith({ attemptId: "a" });
    expect(response.status).toBe(202);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ data: { status: "checking" } });
  });
});
