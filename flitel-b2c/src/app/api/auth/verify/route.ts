import { callBackend } from "@/lib/backend-headers";
import { readJsonBody } from "@/lib/request-body";
import { sessionResponse } from "../../../../lib/session-response";

export async function POST(request: Request) {
  const body = await readJsonBody(request, 1024);
  if ("tooLarge" in body)
    return Response.json({ error: { code: "REQUEST_TOO_LARGE", message: "Request too large." } }, { status: 413 });
  return sessionResponse(await callBackend("/api/auth/otp/verify", { method: "POST", body: body.input }));
}
