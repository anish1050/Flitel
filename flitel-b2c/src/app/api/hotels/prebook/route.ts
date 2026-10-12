import { z } from "zod";
import { prebookRoom } from "@/lib/hotel-api";
import { readJsonBody } from "@/lib/request-body";

export const maxDuration = 40;

const prebookBodySchema = z.object({
  offerId: z.string().regex(/^[A-Za-z0-9_=+/.-]{8,1500}$/),
});
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const body = await readJsonBody(request, 2 * 1024);
  if ("tooLarge" in body)
    return Response.json(
      { error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." } },
      { status: 413, headers: noStore },
    );
  const parsed = prebookBodySchema.safeParse(body.input);
  if (!parsed.success)
    return Response.json(
      { error: { code: "INVALID_OFFER_ID", message: "Choose a valid room." } },
      { status: 400, headers: noStore },
    );
  const result = await prebookRoom(parsed.data.offerId);
  return Response.json(result.body, { status: result.status, headers: noStore });
}
