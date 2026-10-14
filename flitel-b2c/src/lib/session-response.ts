import { z } from "zod";
import { sessionCookieName } from "@/lib/backend-headers";

const sessionAnswerSchema = z.object({
  data: z.object({ token: z.string(), expiresAt: z.number(), email: z.string() }),
});

/**
 * Turns the API's sign-in answer into the browser's: the token goes into an HttpOnly cookie
 * and page scripts only ever see the email. Any failure passes through without a cookie.
 */
export function sessionResponse(result: { status: number; body: unknown }): Response {
  const headers = new Headers({ "Cache-Control": "no-store" });
  const session = sessionAnswerSchema.safeParse(result.body);
  if (result.status !== 200 || !session.success)
    return Response.json(result.body, { status: result.status === 200 ? 502 : result.status, headers });

  const { token, expiresAt, email } = session.data.data;
  headers.append(
    "Set-Cookie",
    `${sessionCookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`,
  );
  return Response.json({ data: { email } }, { headers });
}
