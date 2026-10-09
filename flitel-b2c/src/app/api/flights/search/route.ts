import { streamFlightOffers } from "@/lib/flight-api";
import { searchSchema } from "@/lib/flights";

export const maxDuration = 60;

export async function POST(request: Request) {
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let byteCount = 0;
  let body = "";
  try {
    if (reader) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        byteCount += value.byteLength;
        if (byteCount > 4096) {
          await reader.cancel();
          return Response.json(
            { error: "Search request is too large." },
            { status: 413 },
          );
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    }
  } finally {
    reader?.releaseLock();
  }
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    input = null;
  }
  const search = searchSchema.safeParse(input);
  if (!search.success)
    return Response.json(
      { error: "Choose valid flight search details." },
      { status: 400 },
    );
  return streamFlightOffers(search.data, request.signal);
}
