import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

type Window = { count: number; resetAt: number };

// ponytail: per-process memory, so the real limit is this times the instance count. Move to Mongo if the API scales out.
const windows = new Map<string, Window>();
const pruneAbove = 10_000;

/** Set by the Next.js server from the visitor's address; only trusted behind FLITEL_API_SECRET. */
export const clientIp = (context: Parameters<MiddlewareHandler>[0]) =>
  context.req.header("x-client-ip")?.trim() || "unknown";

export function rateLimit(name: string, limit: number, windowMs: number): MiddlewareHandler {
  return async (context, next) => {
    const now = Date.now();
    if (windows.size > pruneAbove) {
      for (const [key, window] of windows) if (window.resetAt <= now) windows.delete(key);
    }
    const key = `${name}:${clientIp(context)}`;
    let window = windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + windowMs };
      windows.set(key, window);
    }
    window.count += 1;
    if (window.count > limit) {
      throw new HTTPException(429, {
        res: Response.json(
          { error: { code: "RATE_LIMITED", message: "Too many requests. Please wait a moment and try again." } },
          { status: 429, headers: { "Retry-After": String(Math.ceil((window.resetAt - now) / 1000)) } },
        ),
      });
    }
    await next();
  };
}

export function resetRateLimits(): void {
  windows.clear();
}
