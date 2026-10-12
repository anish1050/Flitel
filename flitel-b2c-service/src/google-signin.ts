import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTVerifyGetKey } from "jose";

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export const googleSignInConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID?.trim());

/** The verified email inside a Google ID token issued for this app, or undefined for anything else. */
export async function verifyGoogleCredential(
  credential: string,
  keys: JWTVerifyGetKey = googleKeys,
): Promise<string | undefined> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) return undefined;
  try {
    const { payload } = await jwtVerify(credential, keys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });
    return payload.email_verified === true && typeof payload.email === "string"
      ? payload.email.toLowerCase()
      : undefined;
  } catch {
    return undefined;
  }
}
