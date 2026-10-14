import { beforeEach, describe, expect, it, vi } from "vitest";
const { callBackend } = vi.hoisted(() => ({ callBackend: vi.fn() }));
vi.mock("@/lib/backend-headers", () => ({ callBackend, sessionCookieName: "flitel_session" }));
vi.mock("@/lib/request-body", () => import("../../../../lib/request-body"));
import { POST } from "./route";

const signIn = (credential = "x".repeat(40)) =>
  POST(
    new Request("http://localhost/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    }),
  );

beforeEach(() => callBackend.mockReset());

describe("google sign-in proxy", () => {
  it("sets the session cookie and returns only the email", async () => {
    callBackend.mockResolvedValue({
      status: 200,
      body: { data: { token: "payload.signature", expiresAt: Date.now() + 1000, email: "a@gmail.com" } },
    });
    const response = await signIn();
    expect(callBackend).toHaveBeenCalledWith("/api/auth/google", {
      method: "POST",
      body: { credential: "x".repeat(40) },
    });
    expect(await response.json()).toEqual({ data: { email: "a@gmail.com" } });
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("sets no cookie when Google's token is rejected", async () => {
    callBackend.mockResolvedValue({
      status: 401,
      body: { error: { code: "GOOGLE_REJECTED", message: "We couldn't verify that Google sign-in." } },
    });
    const response = await signIn();
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects an oversized body", async () => {
    expect((await signIn("x".repeat(9000))).status).toBe(413);
    expect(callBackend).not.toHaveBeenCalled();
  });
});
