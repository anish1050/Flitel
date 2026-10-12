import "server-only";
import { cookies, headers } from "next/headers";

export const sessionCookieName = "flitel_session";

/**
 * What the API needs to know about this request: the shared secret that proves the call came
 * from the web app, the visitor's address for rate limits, and their email session if any.
 * Outside a request (unit tests, build time) there is nothing to forward.
 */
export async function backendHeaders(): Promise<Record<string, string>> {
  const forwarded: Record<string, string> = {};
  const secret = process.env.FLITEL_API_SECRET?.trim();
  if (secret) forwarded["X-Flitel-Internal"] = secret;
  try {
    const incoming = await headers();
    const address =
      incoming.get("x-forwarded-for")?.split(",")[0]?.trim() || incoming.get("x-real-ip")?.trim();
    if (address) forwarded["X-Client-IP"] = address;
    const session = (await cookies()).get(sessionCookieName)?.value;
    if (session) forwarded.Authorization = `Bearer ${session}`;
  } catch {
    // No request scope.
  }
  return forwarded;
}

/** A plain JSON call to the API for the sign-in routes; answers are passed through as they are. */
export async function callBackend(
  path: string,
  options: { method: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown },
): Promise<{ status: number; body: unknown }> {
  const base = process.env.FLITEL_API_URL?.trim().replace(/\/$/, "");
  const unavailable = {
    status: 503,
    body: { error: { code: "UNAVAILABLE", message: "Sign-in isn't available right now. Please try again shortly." } },
  };
  if (!base) return unavailable;
  try {
    const response = await fetch(`${base}${path}`, {
      method: options.method,
      headers: {
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(await backendHeaders()),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  } catch {
    return unavailable;
  }
}
