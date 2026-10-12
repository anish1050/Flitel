import { raiseApiError } from "./duffel.js";

const liteapiBaseUrls = {
  api: "https://api.liteapi.travel/v3.0",
  book: "https://book.liteapi.travel/v3.0",
} as const;

export type LiteapiResult = { status: number; body: unknown };

// Thrown when LiteAPI gave no answer at all, so callers can tell that apart from an error reply.
export class LiteapiUnreachable extends Error {}

export function readLiteapiKey(): string | undefined {
  return process.env.LITEAPI_KEY?.trim() || undefined;
}

export function requireLiteapiKey(): string {
  const key = readLiteapiKey();
  if (!key) {
    raiseApiError(503, "LITEAPI_NOT_CONFIGURED", "Hotel booking isn't available yet.");
  }
  if (/^(prod|live)_/i.test(key)) {
    raiseApiError(503, "LITEAPI_LIVE_REFUSED", "Hotel booking runs in the sandbox only.");
  }
  return key;
}

export async function requestLiteapi(
  host: keyof typeof liteapiBaseUrls,
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<LiteapiResult> {
  const key = requireLiteapiKey();
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 20_000);
  let status: number;
  let text: string;
  try {
    const response = await fetch(`${liteapiBaseUrls[host]}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-Key": key,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    });
    status = response.status;
    text = await response.text();
  } catch {
    throw new LiteapiUnreachable();
  }

  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // An unreadable body is reported as null; the status still tells the caller what happened.
  }
  return { status, body };
}

export function liteapiErrorCode(body: unknown): number | undefined {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  if (typeof code === "number") return code;
  return typeof code === "string" && /^\d+$/.test(code) ? Number(code) : undefined;
}

export function assertSandbox(body: unknown): void {
  const flag = (body as { sandbox?: unknown } | null)?.sandbox;
  if (flag !== undefined && flag !== true) {
    raiseApiError(
      503,
      "LITEAPI_LIVE_REFUSED",
      "Hotel booking is only available in test mode.",
    );
  }
}
