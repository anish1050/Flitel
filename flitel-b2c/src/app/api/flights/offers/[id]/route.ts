import { fetchSupplierOffer, hasFlightBackend } from "@/lib/flight-api";

const unavailable = "This fare is no longer available. Please search again.";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!hasFlightBackend() || !/^off_[A-Za-z0-9_]+$/.test(id))
    return Response.json({ error: { message: unavailable } }, { status: 404 });
  try {
    const offer = await fetchSupplierOffer(id);
    return Response.json(
      { data: { totalAmount: offer.totalAmount, currency: offer.currency } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: { message: error instanceof Error ? error.message : unavailable } },
      { status: 502 },
    );
  }
}
