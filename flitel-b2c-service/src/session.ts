import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { raiseApiError } from "./duffel.js";

const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;

function readSessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    raiseApiError(503, "SESSIONS_UNAVAILABLE", "Sign-in isn't available right now. Nothing was booked.");
  }
  return secret;
}

const sign = (payload: string, secret: string) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

/** The email is never stored server-side; people are keyed by this hash. */
export function hashEmail(email: string): string {
  return createHash("sha256").update(email).digest("hex");
}

export function hashWithSecret(value: string): string {
  return sign(value, readSessionSecret());
}

export function issueSession(email: string, now = Date.now()): { token: string; expiresAt: number } {
  const expiresAt = now + sessionLifetimeMs;
  const payload = Buffer.from(JSON.stringify({ e: email, x: expiresAt })).toString("base64url");
  return { token: `${payload}.${sign(payload, readSessionSecret())}`, expiresAt };
}

export function readSessionEmail(token: string, now = Date.now()): string | undefined {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return undefined;
  const expected = Buffer.from(sign(payload, readSessionSecret()));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;
  try {
    const { e, x } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof e === "string" && typeof x === "number" && x > now ? e : undefined;
  } catch {
    return undefined;
  }
}

/** Returns the verified email, or ends the request with 401. */
export function requireSession(context: Context): string {
  const header = context.req.header("authorization") ?? "";
  const email = header.startsWith("Bearer ") ? readSessionEmail(header.slice(7)) : undefined;
  if (!email) {
    raiseApiError(401, "SESSION_REQUIRED", "Please verify your email to continue. Nothing was booked.");
  }
  return email;
}
