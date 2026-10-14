import { beforeEach, describe, expect, it, vi } from "vitest";
const { callBackend } = vi.hoisted(() => ({ callBackend: vi.fn() }));
vi.mock("@/lib/backend-headers", () => ({ callBackend, sessionCookieName: "flitel_session" }));
vi.mock("@/lib/request-body", () => import("../../../../lib/request-body"));
import { POST } from "./route";

const verify = () =>
  POST(
    new Request("http://localhost/api/auth/verify", {
      method: "POST",
      body: '{"email":"a@example.com","code":"123456"}',
    }),
  );

beforeEach(() => callBackend.mockReset());

describe("verify proxy", () => {
  it("keeps the token in an HttpOnly cookie and out of the response body", async () => {
    callBackend.mockResolvedValue({
      status: 200,
      body: { data: { token: "payload.signature", expiresAt: Date.now() + 1000, email: "a@example.com" } },
    });
    const response = await verify();
    expect(await response.json()).toEqual({ data: { email: "a@example.com" } });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("flitel_session=payload.signature");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("sets no cookie when the code is wrong", async () => {
    callBackend.mockResolvedValue({
      status: 400,
      body: { error: { code: "INVALID_CODE", message: "That code didn't work." } },
    });
    const response = await verify();
    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
