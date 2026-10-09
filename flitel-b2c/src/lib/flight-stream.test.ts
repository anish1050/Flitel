import { describe, expect, it, vi } from "vitest";
import { readFlightOffers } from "./flight-stream";
import { supplierOffer } from "./duffel-offer.fixture";

const encoder = new TextEncoder();
function flightStream(lines: unknown[]) {
  const bytes = encoder.encode(
    lines.map((line) => JSON.stringify(line)).join("\n"),
  );
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += 7)
        controller.enqueue(bytes.slice(offset, offset + 7));
      controller.close();
    },
  });
}

describe("progressive flight results", () => {
  it("decodes split UTF-8 and lines, emits early offers and deduplicates later updates", async () => {
    const onOffers = vi.fn();
    const first = {
      ...supplierOffer,
      owner: { name: "Aéro Airways", iata_code: "AE" },
    };
    await readFlightOffers(
      flightStream([
        { type: "offers", offers: [first] },
        {
          type: "offers",
          offers: [
            { ...first, total_amount: "400.00" },
            { ...first, id: "off_other" },
          ],
        },
        { type: "complete" },
      ]),
      onOffers,
      new AbortController().signal,
    );
    expect(onOffers).toHaveBeenCalledTimes(2);
    expect(onOffers.mock.calls[0][0]).toHaveLength(1);
    expect(onOffers.mock.calls[0][0][0].airline).toBe("Aéro Airways");
    expect(onOffers.mock.calls[1][0]).toHaveLength(2);
    expect(onOffers.mock.calls[1][0][0].price).toBe(400);
  });

  it("keeps delivered offers when a later error occurs and rejects truncated streams", async () => {
    const onOffers = vi.fn();
    await expect(
      readFlightOffers(
        flightStream([
          { type: "offers", offers: [supplierOffer] },
          { type: "error", message: "Provider could not finish" },
        ]),
        onOffers,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/finish/);
    expect(onOffers).toHaveBeenCalledTimes(1);
    await expect(
      readFlightOffers(
        flightStream([{ type: "offers", offers: [] }]),
        vi.fn(),
        new AbortController().signal,
      ),
    ).rejects.toThrow(/finish/);
  });

  it("cancels a pending read on abort and never delivers old results afterward", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const controller = new AbortController();
    const onOffers = vi.fn();
    const result = readFlightOffers(body, onOffers, controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(onOffers).not.toHaveBeenCalled();
  });
});
