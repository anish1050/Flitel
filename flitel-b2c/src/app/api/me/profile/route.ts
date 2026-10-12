import { callBackend } from "@/lib/backend-headers";
import { readJsonBody } from "@/lib/request-body";

export async function PUT(request: Request) {
  const body = await readJsonBody(request, 1024);
  if ("tooLarge" in body)
    return Response.json({ error: { code: "REQUEST_TOO_LARGE", message: "Request too large." } }, { status: 413 });
  const result = await callBackend("/api/me/profile", { method: "PUT", body: body.input });
  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
