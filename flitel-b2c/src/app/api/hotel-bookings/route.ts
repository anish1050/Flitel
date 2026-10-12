import { createHotelBooking } from "@/lib/hotel-api";
import { readJsonBody } from "@/lib/request-body";

export const maxDuration = 90;

export async function POST(request: Request) {
  const body = await readJsonBody(request, 8 * 1024);
  if ("tooLarge" in body)
    return Response.json(
      { error: { code: "REQUEST_TOO_LARGE", message: "The booking request is too large." } },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  const result = await createHotelBooking(body.input);
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
