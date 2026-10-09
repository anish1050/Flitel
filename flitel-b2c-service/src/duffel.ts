import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";

export function raiseApiError(
  status: ContentfulStatusCode,
  code: string,
  message: string,
): never {
  throw new HTTPException(status, {
    res: Response.json({ error: { code, message } }, { status }),
  });
}

export function readDuffelTestToken(): string | undefined {
  const token = process.env.DUFFEL_ACCESS_TOKEN?.trim();
  return token && /^duffel_test_\S+$/.test(token) ? token : undefined;
}

export function requireDuffelTestToken(): string {
  const token = readDuffelTestToken();
  if (!token) {
    raiseApiError(
      503,
      "DUFFEL_NOT_CONFIGURED",
      "Flight search needs a Duffel test access token.",
    );
  }

  return token;
}

function duffelHeaders(token: string) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "Duffel-Version": "v2",
    Authorization: `Bearer ${token}`,
  };
}

export async function requestDuffel(
  path: string,
  body?: unknown,
  options: { token?: string; signal?: AbortSignal } = {},
): Promise<unknown> {
  const token = options.token ?? requireDuffelTestToken();
  let response: Response;
  try {
    response = await fetch(`https://api.duffel.com${path}`, {
      method: body ? "POST" : "GET",
      headers: duffelHeaders(token),
      body: body ? JSON.stringify({ data: body }) : undefined,
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(20_000)])
        : AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      raiseApiError(
        504,
        "DUFFEL_TIMEOUT",
        "Flight search took too long. Please try again.",
      );
    }
    raiseApiError(
      502,
      "DUFFEL_UNAVAILABLE",
      "The flight supplier is temporarily unavailable.",
    );
  }

  if (!response.ok) {
    if (response.status === 422) {
      const failure = z
        .object({ errors: z.array(z.object({ code: z.string() })) })
        .safeParse(await response.json().catch(() => null));
      if (
        failure.success &&
        failure.data.errors.some(
          (error) =>
            error.code === "offer_expired" ||
            error.code === "offer_no_longer_available",
        )
      ) {
        raiseApiError(
          410,
          "OFFER_UNAVAILABLE",
          "This offer is no longer available. Please search again.",
        );
      }
      raiseApiError(
        422,
        "INVALID_SEARCH",
        "The supplier could not accept this search. Check the airports and dates.",
      );
    }
    await response.body?.cancel();
    if (response.status === 404 || response.status === 410) {
      raiseApiError(
        410,
        "OFFER_UNAVAILABLE",
        "This offer is no longer available. Please search again.",
      );
    }
    const status = [401, 403, 429].includes(response.status) ? 503 : 502;
    raiseApiError(
      status,
      "DUFFEL_UNAVAILABLE",
      "The flight supplier is temporarily unavailable.",
    );
  }

  try {
    const envelope = z
      .object({ data: z.unknown() })
      .parse(await response.json());
    return envelope.data;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      raiseApiError(
        504,
        "DUFFEL_TIMEOUT",
        "Flight search took too long. Please try again.",
      );
    }
    raiseApiError(
      502,
      "DUFFEL_INVALID_RESPONSE",
      "The flight supplier returned an invalid response. Please try again.",
    );
  }
}

export type DuffelOrderResult =
  | { outcome: "created"; order: unknown }
  | { outcome: "rejected"; codes: string[]; message?: string }
  | { outcome: "unknown" };

const duffelErrorsSchema = z.object({
  errors: z.array(
    z.object({ code: z.string().optional(), message: z.string().optional() }),
  ),
});

// Only a 4xx proves Duffel did not create the order; anything else might have booked seats.
export async function placeDuffelOrder(
  body: unknown,
  token: string,
): Promise<DuffelOrderResult> {
  let response: Response;
  try {
    response = await fetch("https://api.duffel.com/air/orders", {
      method: "POST",
      headers: duffelHeaders(token),
      body: JSON.stringify({ data: body }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return { outcome: "unknown" };
  }
  if (response.status >= 500) {
    await response.body?.cancel();
    return { outcome: "unknown" };
  }
  const json: unknown = await response.json().catch(() => undefined);
  if (response.ok) {
    const envelope = z.object({ data: z.unknown() }).safeParse(json);
    return envelope.success
      ? { outcome: "created", order: envelope.data.data }
      : { outcome: "unknown" };
  }
  const errors = duffelErrorsSchema.safeParse(json);
  return {
    outcome: "rejected",
    codes: errors.success
      ? errors.data.errors.flatMap((error) => (error.code ? [error.code] : []))
      : [],
    // Only a 422 carries validation text meant for the customer; 401/403/429 messages are internal.
    message:
      response.status === 422 && errors.success
        ? errors.data.errors.find((error) => error.message)?.message
        : undefined,
  };
}
