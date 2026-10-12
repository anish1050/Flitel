import { raiseApiError } from "./duffel.js";

const unavailable = () =>
  raiseApiError(503, "EMAIL_UNAVAILABLE", "We couldn't send the code right now. Please try again shortly.");

export async function sendEmail(message: { to: string; subject: string; text: string }): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    // Local development only; a server without a key and without this flag refuses instead of leaking codes.
    if (process.env.OTP_DEV_ECHO !== "true") unavailable();
    console.log(`[dev email] to=${message.to} subject=${message.subject}\n${message.text}`);
    return;
  }
  const from = process.env.EMAIL_FROM?.trim();
  if (!from) unavailable();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: message.to, subject: message.subject, text: message.text }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
  if (!response?.ok) unavailable();
}
