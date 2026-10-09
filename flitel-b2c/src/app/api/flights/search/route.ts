import { streamFlightOffers } from "@/lib/flight-api";
import { searchSchema } from "@/lib/flights";
import { readJsonBody } from "@/lib/request-body";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await readJsonBody(request, 4096);
  if ("tooLarge" in body)
    return Response.json({ error: "Search request is too large." }, { status: 413 });
  const search = searchSchema.safeParse(body.input);
  if (!search.success)
    return Response.json({ error: "Choose valid flight search details." }, { status: 400 });
  return streamFlightOffers(search.data, request.signal);
}
