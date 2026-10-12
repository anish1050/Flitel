import nodemailer from "nodemailer";
import { raiseApiError } from "./duffel.js";

const unavailable = () =>
  raiseApiError(503, "EMAIL_UNAVAILABLE", "We couldn't send the code right now. Please try again shortly.");

type Message = { to: string; subject: string; text: string };

// Free route that needs no domain: an ordinary mailbox (for example Gmail with an app password).
async function sendWithSmtp(message: Message, user: string, password: string): Promise<void> {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass: password },
    connectionTimeout: 10_000,
  });
  const from = process.env.EMAIL_FROM?.trim() || `TripKnot <${user}>`;
  await transport.sendMail({ from, ...message }).catch(unavailable);
}

async function sendWithResend(message: Message, key: string): Promise<void> {
  const from = process.env.EMAIL_FROM?.trim();
  if (!from) unavailable();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, ...message }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
  if (!response?.ok) unavailable();
}

async function sendWithConfiguredProvider(message: Message): Promise<boolean> {
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPassword = process.env.SMTP_PASSWORD?.trim();
  if (smtpUser && smtpPassword) {
    await sendWithSmtp(message, smtpUser, smtpPassword);
    return true;
  }
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    await sendWithResend(message, resendKey);
    return true;
  }
  return false;
}

export async function sendEmail(message: Message): Promise<void> {
  // Local development only. Without this flag a server with no working provider refuses instead of leaking codes.
  const echoInstead = () => {
    console.log(`[dev email] to=${message.to} subject=${message.subject}
${message.text}`);
  };
  const devEcho = process.env.OTP_DEV_ECHO === "true";
  try {
    if (await sendWithConfiguredProvider(message)) return;
  } catch (error) {
    // Resend's test sender only reaches the account owner; the console keeps every other address testable.
    if (!devEcho) throw error;
  }
  if (!devEcho) unavailable();
  echoInstead();
}
