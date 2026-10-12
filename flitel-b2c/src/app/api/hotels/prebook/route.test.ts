import { beforeEach, describe, expect, it, vi } from "vitest";
const { prebookRoom } = vi.hoisted(() => ({ prebookRoom: vi.fn() }));
vi.mock("@/lib/hotel-api", () => ({ prebookRoom }));
// Vitest has no "@/" alias here; the booking route test resolves it the same way.
vi.mock("@/lib/request-body", () => import("../../../../lib/request-body"));
import { POST } from "./route";

const post = (body: string) =>
  POST(new Request("http://localhost/api/hotels/prebook", { method: "POST", body }));

describe("prebook proxy", () => {
  beforeEach(() => prebookRoom.mockReset());

  it("rejects an oversized body before forwarding it", async () => {
    const response = await post("x".repeat(3 * 1024));
    expect(response.status).toBe(413);
    expect(prebookRoom).not.toHaveBeenCalled();
  });

  it.each(["not json", "{}", '{"offerId":42}', '{"offerId":"../x"}'])(
    "rejects the body %s without forwarding",
    async (body) => {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_OFFER_ID");
      expect(prebookRoom).not.toHaveBeenCalled();
    },
  );

  it("forwards only the offer id and returns the backend status uncached", async () => {
    prebookRoom.mockResolvedValue({ status: 410, body: { error: { code: "OFFER_UNAVAILABLE" } } });
    const response = await post('{"offerId":"offer-12345678","extra":"x"}');
    expect(prebookRoom).toHaveBeenCalledWith("offer-12345678");
    expect(response.status).toBe(410);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: { code: "OFFER_UNAVAILABLE" } });
  });
});
