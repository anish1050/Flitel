import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/flight-api", () => ({ streamFlightOffers: vi.fn() }));
vi.mock("@/lib/flights", () => import("../../../../lib/flights"));
import { POST } from "./route";

describe("flight search proxy validation", () => {
  it("rejects an oversized body without Content-Length before forwarding it", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4097));
      },
      cancel,
    });
    const request = new Request("http://localhost/api/flights/search", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit);
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid search JSON before forwarding it", async () => {
    const response = await POST(
      new Request("http://localhost/api/flights/search", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(response.status).toBe(400);
  });
});
