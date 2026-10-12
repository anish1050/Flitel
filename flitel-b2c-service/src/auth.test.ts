import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "./index.js";
import { resetRateLimits } from "./rate-limit.js";
import { issueSession, readSessionEmail } from "./session.js";
import { sessionHeader } from "./test-support.js";

const { verifyGoogleCredential } = vi.hoisted(() => ({ verifyGoogleCredential: vi.fn() }));
vi.mock("./google-signin.js", () => ({
  googleSignInConfigured: () => Boolean(process.env.GOOGLE_CLIENT_ID),
  verifyGoogleCredential,
}));

type Doc = Record<string, any>;
const { stores } = vi.hoisted(() => ({
  stores: new Map<string, Map<string, Doc>>(),
}));
vi.mock("./mongodb.js", () => ({
  getDatabase: () => ({
    command: vi.fn(),
    collection: (name: string) => {
      const store = stores.get(name) ?? stores.set(name, new Map()).get(name)!;
      return {
        findOne: async ({ _id }: Doc) => store.get(_id) ?? null,
        replaceOne: async ({ _id }: Doc, doc: Doc) => void store.set(_id, { _id, ...doc }),
        deleteOne: async ({ _id }: Doc) => void store.delete(_id),
        findOneAndUpdate: async (filter: Doc, update: Doc) => {
          const doc = store.get(filter._id);
          if (!doc) return null;
          if (doc.codeExpiresAt <= filter.codeExpiresAt.$gt) return null;
          if (doc.attempts >= filter.attempts.$lt) return null;
          doc.attempts += update.$inc.attempts;
          return doc;
        },
      };
    },
  }),
}));

const echoed: string[] = [];
const email = "traveller@example.com";

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
const lastCode = () => /is (\d{6})\./.exec(echoed.at(-1) ?? "")?.[1] ?? "";
const errorCode = async (response: Response) => (await response.json()).error.code;

beforeEach(() => {
  stores.clear();
  echoed.length = 0;
  resetRateLimits();
  vi.stubEnv("SESSION_SECRET", "test-session-secret-0123456789abcdef");
  vi.stubEnv("OTP_DEV_ECHO", "true");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.spyOn(console, "log").mockImplementation((line: string) => void echoed.push(line));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T10:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("session tokens", () => {
  it("round-trips, expires, and rejects tampering", () => {
    const { token } = issueSession(email, Date.parse("2026-10-12T10:00:00Z"));
    const now = Date.parse("2026-10-12T10:00:00Z");
    expect(readSessionEmail(token, now + 1000)).toBe(email);
    expect(readSessionEmail(token, now + 8 * 24 * 3600_000)).toBeUndefined();
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ e: "other@example.com", x: now + 1e9 })).toString("base64url");
    expect(readSessionEmail(`${forged}.${signature}`, now)).toBeUndefined();
    expect(readSessionEmail(`${payload}.`, now)).toBeUndefined();
  });
});

describe("email codes", () => {
  it("sends a code, then trades it for a session once", async () => {
    expect((await post("/api/auth/otp/send", { email: "Traveller@Example.com" })).status).toBe(200);
    const code = lastCode();
    expect(code).toMatch(/^\d{6}$/);

    const verified = await post("/api/auth/otp/verify", { email, code });
    expect(verified.status).toBe(200);
    const { token, email: confirmed } = (await verified.json()).data;
    expect(confirmed).toBe(email);
    expect(readSessionEmail(token)).toBe(email);

    expect(await errorCode(await post("/api/auth/otp/verify", { email, code }))).toBe("INVALID_CODE");
  });

  it("never stores the email address or the code in clear", async () => {
    await post("/api/auth/otp/send", { email });
    const stored = JSON.stringify([...stores.get("email_otps")!.values()]);
    expect(stored).not.toContain(email);
    expect(stored).not.toContain(lastCode());
  });

  it("allows five wrong guesses, then even the right code fails", async () => {
    await post("/api/auth/otp/send", { email });
    const right = lastCode();
    const wrong = right === "000000" ? "111111" : "000000";
    for (let guess = 0; guess < 5; guess += 1) {
      expect(await errorCode(await post("/api/auth/otp/verify", { email, code: wrong }))).toBe("INVALID_CODE");
    }
    expect(await errorCode(await post("/api/auth/otp/verify", { email, code: right }))).toBe("INVALID_CODE");
  });

  it("rejects an expired code", async () => {
    await post("/api/auth/otp/send", { email });
    vi.setSystemTime(new Date("2026-10-12T10:11:00Z"));
    expect(await errorCode(await post("/api/auth/otp/verify", { email, code: lastCode() }))).toBe("INVALID_CODE");
  });

  it("makes people wait a minute between codes and caps an hour at five", async () => {
    expect((await post("/api/auth/otp/send", { email })).status).toBe(200);
    expect(await errorCode(await post("/api/auth/otp/send", { email }))).toBe("OTP_COOLDOWN");
    for (let sent = 2; sent <= 5; sent += 1) {
      vi.setSystemTime(Date.now() + 61_000);
      resetRateLimits();
      expect((await post("/api/auth/otp/send", { email })).status).toBe(200);
    }
    vi.setSystemTime(Date.now() + 61_000);
    resetRateLimits();
    expect(await errorCode(await post("/api/auth/otp/send", { email }))).toBe("OTP_LIMIT");
  });

  it("limits one address to five sends in ten minutes", async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 6; index += 1) {
      statuses.push((await post("/api/auth/otp/send", { email: `person${index}@example.com` })).status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it("refuses to send when no email provider is configured", async () => {
    vi.stubEnv("OTP_DEV_ECHO", "");
    const response = await post("/api/auth/otp/send", { email });
    expect(response.status).toBe(503);
    expect(echoed).toHaveLength(0);
  });

  it("rejects malformed input", async () => {
    expect((await post("/api/auth/otp/send", { email: "nope" })).status).toBe(400);
    expect((await post("/api/auth/otp/verify", { email, code: "12" })).status).toBe(400);
  });
});

describe("google sign-in", () => {
  const credential = "a".repeat(40);

  it("turns a verified Google token into a session", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
    verifyGoogleCredential.mockResolvedValue(email);
    const response = await post("/api/auth/google", { credential });
    expect(response.status).toBe(200);
    expect(readSessionEmail((await response.json()).data.token)).toBe(email);
  });

  it("rejects a token Google did not issue for this app", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
    verifyGoogleCredential.mockResolvedValue(undefined);
    const response = await post("/api/auth/google", { credential });
    expect([response.status, await errorCode(response)]).toEqual([401, "GOOGLE_REJECTED"]);
  });

  it("is unavailable until a client id is configured", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    expect((await post("/api/auth/google", { credential })).status).toBe(503);
  });
});

describe("the booking gate", () => {
  it("turns away booking, prebook and hotel booking without a verified email", async () => {
    for (const path of ["/api/bookings", "/api/hotels/prebook", "/api/hotel-bookings"]) {
      const response = await post(path, {});
      expect([path, response.status, await errorCode(response)]).toEqual([path, 401, "SESSION_REQUIRED"]);
    }
    const forged = await post("/api/bookings", {}, { Authorization: "Bearer abc.def" });
    expect(forged.status).toBe(401);
  });

  it("lets a verified session through to validation", async () => {
    const response = await post("/api/bookings", {}, sessionHeader());
    expect(await errorCode(response)).toBe("INVALID_BOOKING");
  });

  it("closes the gate when sessions are not configured", async () => {
    vi.stubEnv("SESSION_SECRET", "");
    const response = await post("/api/bookings", {}, { Authorization: "Bearer abc.def" });
    expect(response.status).toBe(503);
  });
});

describe("shared secret", () => {
  it("rejects calls without it, but leaves the health check open", async () => {
    vi.stubEnv("FLITEL_API_SECRET", "internal-secret-value");
    expect((await post("/api/hotels/search", {})).status).toBe(403);
    expect((await post("/api/hotels/search", {}, { "X-Flitel-Internal": "wrong-secret-value!" })).status).toBe(403);
    expect((await post("/api/hotels/search", {}, { "X-Flitel-Internal": "internal-secret-value" })).status).toBe(400);
    expect((await app.request("/api/health")).status).not.toBe(403);
  });
});

describe("rate limits", () => {
  it("counts each visitor address separately", async () => {
    const search = (ip: string) => post("/api/hotels/search", {}, { "X-Client-IP": ip });
    for (let index = 0; index < 60; index += 1) expect((await search("1.1.1.1")).status).toBe(400);
    const limited = await search("1.1.1.1");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    expect((await search("2.2.2.2")).status).toBe(400);
  });
});

describe("saved details", () => {
  const profile = { firstName: "Asha", lastName: "Rao", phone: "+919876543210" };
  const get = async (headers: Record<string, string>) => app.request("/api/me", { headers });

  it("needs a session", async () => {
    expect((await get({})).status).toBe(401);
  });

  it("saves, returns and deletes the profile for the verified email", async () => {
    const headers = sessionHeader(email);
    expect((await get(headers).then((r) => r.json())).data.profile).toBeNull();

    const saved = await app.request("/api/me/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(profile),
    });
    expect(saved.status).toBe(200);
    expect(JSON.stringify([...stores.get("profiles")!.values()])).not.toContain(email);

    expect((await get(headers).then((r) => r.json())).data).toEqual({ email, profile });
    expect((await get(sessionHeader("someone@else.com")).then((r) => r.json())).data.profile).toBeNull();

    const removed = await app.request("/api/me", { method: "DELETE", headers });
    expect(removed.status).toBe(200);
    expect((await get(headers).then((r) => r.json())).data.profile).toBeNull();
  });

  it("rejects an incomplete profile", async () => {
    const response = await app.request("/api/me/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...sessionHeader() },
      body: JSON.stringify({ firstName: "Asha" }),
    });
    expect(response.status).toBe(400);
  });
});
