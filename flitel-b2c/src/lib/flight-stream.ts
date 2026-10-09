import type { FlightOffer } from "./flights";
import { z } from "zod";
import { parseDuffelOffer } from "./duffel-offers";

const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("offers"), offers: z.array(z.unknown()) }),
  z.object({ type: z.literal("complete") }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export async function readFlightOffers(
  body: ReadableStream<Uint8Array>,
  onOffers: (offers: FlightOffer[]) => void,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const offersById = new Map<string, FlightOffer>();
  let buffer = "";
  let isComplete = false;
  const cancelRead = () => {
    void reader.cancel(signal.reason).catch(() => {});
  };
  signal.addEventListener("abort", cancelRead, { once: true });
  try {
    while (!isComplete) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop()!;
      if (done && buffer.trim()) lines.push(buffer);
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = eventSchema.parse(JSON.parse(line));
        if (event.type === "error")
          throw new Error(
            "We couldn’t finish checking all flights. Please search again.",
          );
        if (event.type === "complete") {
          isComplete = true;
          break;
        }
        const batch = event.offers.map(parseDuffelOffer);
        for (const offer of batch) offersById.set(offer.id, offer);
        if (batch.length) onOffers([...offersById.values()]);
      }
      if (done && !isComplete)
        throw new Error(
          "We couldn’t finish checking all flights. Please search again.",
        );
    }
  } finally {
    signal.removeEventListener("abort", cancelRead);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
