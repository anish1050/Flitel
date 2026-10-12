import { SignJWT, generateKeyPair } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyGoogleCredential } from "./google-signin.js";

const clientId = "123-abc.apps.googleusercontent.com";
const { publicKey, privateKey } = await generateKeyPair("RS256");
const otherPair = await generateKeyPair("RS256");
const keys = async () => publicKey;

function token(
  claims: Record<string, unknown>,
  options: { issuer?: string; audience?: string; key?: CryptoKey } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(options.issuer ?? "https://accounts.google.com")
    .setAudience(options.audience ?? clientId)
    .setExpirationTime("10m")
    .sign(options.key ?? privateKey);
}

beforeEach(() => vi.stubEnv("GOOGLE_CLIENT_ID", clientId));

describe("verifyGoogleCredential", () => {
  it("returns the lower-cased email of a valid token", async () => {
    const credential = await token({ email: "Traveller@Gmail.com", email_verified: true });
    expect(await verifyGoogleCredential(credential, keys)).toBe("traveller@gmail.com");
  });

  it("rejects an unverified email", async () => {
    const credential = await token({ email: "a@gmail.com", email_verified: false });
    expect(await verifyGoogleCredential(credential, keys)).toBeUndefined();
  });

  it("rejects a token made for another app", async () => {
    const credential = await token({ email: "a@gmail.com", email_verified: true }, { audience: "other-app" });
    expect(await verifyGoogleCredential(credential, keys)).toBeUndefined();
  });

  it("rejects a token from another issuer", async () => {
    const credential = await token(
      { email: "a@gmail.com", email_verified: true },
      { issuer: "https://evil.example" },
    );
    expect(await verifyGoogleCredential(credential, keys)).toBeUndefined();
  });

  it("rejects a token signed with a different key", async () => {
    const credential = await token(
      { email: "a@gmail.com", email_verified: true },
      { key: otherPair.privateKey },
    );
    expect(await verifyGoogleCredential(credential, keys)).toBeUndefined();
  });

  it("rejects garbage, and everything when Google sign-in is not configured", async () => {
    expect(await verifyGoogleCredential("not-a-jwt", keys)).toBeUndefined();
    const credential = await token({ email: "a@gmail.com", email_verified: true });
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    expect(await verifyGoogleCredential(credential, keys)).toBeUndefined();
  });
});
