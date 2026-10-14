import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertSandbox,
  LiteapiUnreachable,
  liteapiErrorCode,
  readLiteapiKey,
  requestLiteapi,
  requireLiteapiKey,
} from "./liteapi.js";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("LITEAPI_KEY", "  sand_example_key  ");
  vi.stubGlobal("fetch", fetchMock.mockReset());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function failureOf(call: () => unknown) {
  try {
    await call();
  } catch (error) {
    return error;
  }
  throw new Error("Expected a failure");
}

describe("LiteAPI key", () => {
  it("is trimmed, and absent when blank", () => {
    expect(readLiteapiKey()).toBe("sand_example_key");
    vi.stubEnv("LITEAPI_KEY", "   ");
    expect(readLiteapiKey()).toBeUndefined();
  });

  it("is required with a 503 that tells the customer hotels are not available", async () => {
    vi.stubEnv("LITEAPI_KEY", "");
    const error = (await failureOf(requireLiteapiKey)) as {
      getResponse(): Response;
    };
    const response = error.getResponse();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "LITEAPI_NOT_CONFIGURED",
        message: "Hotel booking isn't available yet.",
      },
    });
  });
});

describe("live key refusal", () => {
  it.each(["prod_abc", "LIVE_abc", "  Prod_abc  "])("refuses %s with a 503", async (key) => {
    vi.stubEnv("LITEAPI_KEY", key);
    const error = (await failureOf(requireLiteapiKey)) as { getResponse(): Response };
    const response = error.getResponse();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "LITEAPI_LIVE_REFUSED",
        message: "Hotel booking runs in the sandbox only.",
      },
    });
  });
});

describe("requestLiteapi", () => {
  it("sends the key to the search host and parses the JSON", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: [] }, { status: 200 }));

    const result = await requestLiteapi("api", "/hotels/rates", {
      method: "POST",
      body: { currency: "INR" },
    });

    expect(result).toEqual({ status: 200, body: { data: [] } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.liteapi.travel/v3.0/hotels/rates");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("X-API-Key")).toBe("sand_example_key");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(init?.body).toBe(JSON.stringify({ currency: "INR" }));
  });

  it("uses the booking host and GET by default", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: {} }));

    await requestLiteapi("book", "/bookings/abc");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://book.liteapi.travel/v3.0/bookings/abc");
    expect(init?.method).toBe("GET");
    expect(init?.body).toBeUndefined();
  });

  it("returns an error status with its body instead of throwing", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: { code: 4040 } }, { status: 408 }),
    );

    expect(await requestLiteapi("book", "/rates/prebook")).toEqual({
      status: 408,
      body: { error: { code: 4040 } },
    });
  });

  it("returns a null body when the reply is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 }));

    expect(await requestLiteapi("api", "/hotels/rates")).toEqual({
      status: 502,
      body: null,
    });
  });

  it("throws LiteapiUnreachable on a network error", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    expect(await failureOf(() => requestLiteapi("api", "/x"))).toBeInstanceOf(
      LiteapiUnreachable,
    );
  });

  it("throws LiteapiUnreachable on a timeout", async () => {
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));

    expect(
      await failureOf(() => requestLiteapi("api", "/x", { timeoutMs: 5 })),
    ).toBeInstanceOf(LiteapiUnreachable);
  });

  it("gives the request a timeout signal", async () => {
    fetchMock.mockResolvedValue(Response.json({}));

    await requestLiteapi("api", "/x", { timeoutMs: 4_000 });

    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("liteapiErrorCode", () => {
  it("reads a numeric or numeric-string code from the error envelope", () => {
    expect(liteapiErrorCode({ error: { code: 4012 } })).toBe(4012);
    expect(liteapiErrorCode({ error: { code: "2013" } })).toBe(2013);
  });

  it("is undefined when there is no usable code", () => {
    expect(liteapiErrorCode(null)).toBeUndefined();
    expect(liteapiErrorCode({ error: {} })).toBeUndefined();
    expect(liteapiErrorCode({ error: { code: "bad_request" } })).toBeUndefined();
    expect(liteapiErrorCode({ data: 1 })).toBeUndefined();
  });
});

describe("assertSandbox", () => {
  it("refuses a live response", async () => {
    const error = (await failureOf(() => assertSandbox({ sandbox: false }))) as {
      getResponse(): Response;
    };
    const response = error.getResponse();
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("LITEAPI_LIVE_REFUSED");
  });

  it("allows sandbox responses", () => {
    expect(() => assertSandbox({ sandbox: true })).not.toThrow();
    expect(() => assertSandbox({ data: [] })).not.toThrow();
    expect(() => assertSandbox(null)).not.toThrow();
  });
});
