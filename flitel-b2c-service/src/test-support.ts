import { issueSession } from "./session.js";

/** A verified-session header for tests of routes that sit behind the email gate. */
export function sessionHeader(email = "guest@example.com"): Record<string, string> {
  process.env.SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
  return { Authorization: `Bearer ${issueSession(email).token}` };
}
