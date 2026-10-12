import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn();
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })) };
});
vi.mock("nodemailer", () => ({ default: { createTransport } }));
import { sendEmail } from "./email.js";

const message = { to: "guest@example.com", subject: "Code", text: "Your code is 123456." };

beforeEach(() => {
  sendMail.mockReset().mockResolvedValue({});
  createTransport.mockClear();
  vi.stubEnv("SMTP_USER", "");
  vi.stubEnv("SMTP_PASSWORD", "");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("EMAIL_FROM", "");
  vi.stubEnv("OTP_DEV_ECHO", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sendEmail", () => {
  it("sends through SMTP to any recipient when a mailbox is configured", async () => {
    vi.stubEnv("SMTP_USER", "me@gmail.com");
    vi.stubEnv("SMTP_PASSWORD", "app-password");
    await sendEmail(message);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: "smtp.gmail.com", auth: { user: "me@gmail.com", pass: "app-password" } }),
    );
    expect(sendMail).toHaveBeenCalledWith({ from: "TripKnot <me@gmail.com>", ...message });
  });

  it("reports unavailable, never the mail error, when SMTP fails", async () => {
    vi.stubEnv("SMTP_USER", "me@gmail.com");
    vi.stubEnv("SMTP_PASSWORD", "wrong");
    sendMail.mockRejectedValue(new Error("535 Bad credentials for me@gmail.com"));
    await expect(sendEmail(message)).rejects.toMatchObject({ status: 503 });
  });

  it("refuses when nothing is configured and the dev flag is off", async () => {
    await expect(sendEmail(message)).rejects.toMatchObject({ status: 503 });
    expect(sendMail).not.toHaveBeenCalled();
  });
});
