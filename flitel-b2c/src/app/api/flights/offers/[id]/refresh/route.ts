import { toBookableOffer } from "@/lib/booking";
import { refreshSupplierOffer } from "@/lib/flight-api";
import { searchSchema } from "@/lib/flights";
import { readJsonBody } from "@/lib/request-body";

export const maxDuration = 60;

const gone = "This flight is no longer available. Please search again.";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await readJsonBody(request, 4096);
  if ("tooLarge" in body)
    return Response.json({ error: { message: "Search request is too large." } }, { status: 413 });
  const search = searchSchema.safeParse(body.input);
  if (!search.success)
    return Response.json({ error: { message: "Choose valid flight search details." } }, { status: 400 });
  const { id } = await params;
  try {
    const offer = await refreshSupplierOffer(id, search.data);
    const bookable = offer && toBookableOffer(offer);
    if (!bookable)
      return Response.json({ error: { code: "OFFER_UNAVAILABLE", message: gone } }, { status: 404 });
    return Response.json({ data: bookable }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: { message: error instanceof Error ? error.message : "The fare could not be refreshed." } },
      { status: 502 },
    );
  }
}
