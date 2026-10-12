import { z } from "zod";
import { callBackend, sessionCookieName } from "@/lib/backend-headers";
import { readJsonBody } from "@/lib/request-body";

const sessionAnswerSchema = z.object({
  data: z.object({ token: z.string(), expiresAt: z.number(), email: z.string() }),
});

export async function POST(request: Request) {
  const body = await readJsonBody(request, 1024);
  if ("tooLarge" in body)
    return Response.json({ error: { code: "REQUEST_TOO_LARGE", message: "Request too large." } }, { status: 413 });
  const result = await callBackend("/api/auth/otp/verify", { method: "POST", body: body.input });
  const session = sessionAnswerSchema.safeParse(result.body);
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (result.status !== 200 || !session.success)
    return Response.json(result.body, { status: result.status === 200 ? 502 : result.status, headers });

  // The token stays in an HttpOnly cookie; page scripts only ever see the email.
  const { token, expiresAt, email } = session.data.data;
  headers.append(
    "Set-Cookie",
    `${sessionCookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`,
  );
  return Response.json({ data: { email } }, { headers });
}
