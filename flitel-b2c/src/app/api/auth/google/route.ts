import { callBackend } from "@/lib/backend-headers";
import { readJsonBody } from "@/lib/request-body";
import { sessionResponse } from "../../../../lib/session-response";

export async function POST(request: Request) {
  // A Google ID token is a signed JWT of a little over a kilobyte.
  const body = await readJsonBody(request, 8192);
  if ("tooLarge" in body)
    return Response.json({ error: { code: "REQUEST_TOO_LARGE", message: "Request too large." } }, { status: 413 });
  return sessionResponse(await callBackend("/api/auth/google", { method: "POST", body: body.input }));
}
