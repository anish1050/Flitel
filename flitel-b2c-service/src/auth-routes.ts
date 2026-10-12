import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { randomInt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { raiseApiError } from "./duffel.js";
import { sendEmail } from "./email.js";
import { getDatabase } from "./mongodb.js";
import { rateLimit } from "./rate-limit.js";
import { hashEmail, hashWithSecret, issueSession, requireSession } from "./session.js";

const codeLifetimeMs = 10 * 60_000;
const resendCooldownMs = 60_000;
const sendWindowMs = 60 * 60_000;
const maxSendsPerWindow = 5;
const maxGuessesPerCode = 5;

type OtpRecord = {
  _id: string;
  codeHash: string;
  codeExpiresAt: Date;
  attempts: number;
  sends: number;
  sentAt: Date;
  windowStart: Date;
  // TTL index target; the whole record disappears with the send window.
  expiresAt: Date;
};
type Profile = {
  _id: string;
  firstName: string;
  lastName: string;
  phone: string;
  updatedAt: Date;
};

const otps = () => getDatabase().collection<OtpRecord>("email_otps");
const profiles = () => getDatabase().collection<Profile>("profiles");

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
const sendSchema = z.object({ email: emailSchema });
const verifySchema = z.object({ email: emailSchema, code: z.string().regex(/^\d{6}$/) });
const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(6).max(20),
});

const codeHash = (email: string, code: string) => hashWithSecret(`${email}:${code}`);

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Mounted under /api.
export const authRoutes = new Hono();

authRoutes.use(
  "*",
  bodyLimit({
    maxSize: 2048,
    onError: () => raiseApiError(413, "REQUEST_TOO_LARGE", "The request body is too large."),
  }),
);
authRoutes.use("/auth/otp/send", rateLimit("otp-send", 5, 10 * 60_000));
authRoutes.use("/auth/otp/verify", rateLimit("otp-verify", 15, 10 * 60_000));

authRoutes.post("/auth/otp/send", async (context) => {
  const parsed = sendSchema.safeParse(await context.req.json().catch(() => undefined));
  if (!parsed.success) raiseApiError(400, "INVALID_EMAIL", "Enter a valid email address.");
  const { email } = parsed.data;
  const id = hashEmail(email);
  const now = new Date();

  const earlier = await otps().findOne({ _id: id });
  if (earlier && now.getTime() - earlier.sentAt.getTime() < resendCooldownMs) {
    raiseApiError(429, "OTP_COOLDOWN", "A code was just sent. Please wait a minute before asking for another.");
  }
  const inWindow = earlier && now.getTime() - earlier.windowStart.getTime() < sendWindowMs;
  const sends = inWindow ? earlier.sends + 1 : 1;
  if (sends > maxSendsPerWindow) {
    raiseApiError(429, "OTP_LIMIT", "Too many codes requested for this email. Please try again in an hour.");
  }
  const windowStart = inWindow ? earlier.windowStart : now;

  const code = String(randomInt(100_000, 1_000_000));
  await otps().replaceOne(
    { _id: id },
    {
      codeHash: codeHash(email, code),
      codeExpiresAt: new Date(now.getTime() + codeLifetimeMs),
      attempts: 0,
      sends,
      sentAt: now,
      windowStart,
      expiresAt: new Date(windowStart.getTime() + sendWindowMs),
    },
    { upsert: true },
  );
  await sendEmail({
    to: email,
    subject: "Your TripKnot verification code",
    text: `Your TripKnot verification code is ${code}.\nIt expires in 10 minutes. If you didn't ask for it, you can ignore this email.`,
  });
  return context.json({ data: { sent: true } });
});

authRoutes.post("/auth/otp/verify", async (context) => {
  const parsed = verifySchema.safeParse(await context.req.json().catch(() => undefined));
  if (!parsed.success) raiseApiError(400, "INVALID_CODE", "Enter the 6-digit code from your email.");
  const { email, code } = parsed.data;
  const id = hashEmail(email);

  // The guess is counted before it is compared, so a code allows five tries however they race.
  const record = await otps().findOneAndUpdate(
    { _id: id, codeExpiresAt: { $gt: new Date() }, attempts: { $lt: maxGuessesPerCode } },
    { $inc: { attempts: 1 } },
    { returnDocument: "after" },
  );
  if (!record || !sameHash(record.codeHash, codeHash(email, code))) {
    raiseApiError(400, "INVALID_CODE", "That code didn't work. Check it, or ask for a new one.");
  }
  await otps().deleteOne({ _id: id });
  const session = issueSession(email);
  return context.json({ data: { token: session.token, expiresAt: session.expiresAt, email } });
});

authRoutes.get("/me", async (context) => {
  const email = requireSession(context);
  const profile = await profiles().findOne({ _id: hashEmail(email) });
  return context.json({
    data: {
      email,
      profile: profile
        ? { firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone }
        : null,
    },
  });
});

authRoutes.put("/me/profile", async (context) => {
  const email = requireSession(context);
  const parsed = profileSchema.safeParse(await context.req.json().catch(() => undefined));
  if (!parsed.success) raiseApiError(400, "INVALID_PROFILE", "Check your name and mobile number.");
  await profiles().replaceOne(
    { _id: hashEmail(email) },
    { ...parsed.data, updatedAt: new Date() },
    { upsert: true },
  );
  return context.json({ data: { saved: true } });
});

authRoutes.delete("/me", async (context) => {
  const id = hashEmail(requireSession(context));
  await Promise.all([profiles().deleteOne({ _id: id }), otps().deleteOne({ _id: id })]);
  return context.json({ data: { deleted: true } });
});
