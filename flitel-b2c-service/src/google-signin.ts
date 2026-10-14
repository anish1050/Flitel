import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTVerifyGetKey } from "jose";

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export const googleSignInConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID?.trim());

export type GoogleIdentity = { email: string; firstName: string; lastName: string };

/** Who a Google ID token issued for this app belongs to, or undefined for anything else. */
export async function verifyGoogleCredential(
  credential: string,
  keys: JWTVerifyGetKey = googleKeys,
): Promise<GoogleIdentity | undefined> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) return undefined;
  try {
    const { payload } = await jwtVerify(credential, keys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });
    if (payload.email_verified !== true || typeof payload.email !== "string") return undefined;
    const text = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, 60) : "");
    return {
      email: payload.email.toLowerCase(),
      firstName: text(payload.given_name),
      lastName: text(payload.family_name),
    };
  } catch {
    return undefined;
  }
}
