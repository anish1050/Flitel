"use client";

import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Field } from "@/components/booking-panels";
import { GoogleSignIn, googleClientId } from "@/components/google-sign-in";

export type SavedProfile = { firstName: string; lastName: string; phone: string };
export type Session = { email: string; profile: SavedProfile | null };

const sessionSchema = z.object({
  data: z.object({
    email: z.string(),
    profile: z
      .object({ firstName: z.string(), lastName: z.string(), phone: z.string() })
      .nullable(),
  }),
});
const errorSchema = z.object({ error: z.object({ message: z.string() }) });
const genericProblem = "Something went wrong. Please try again.";

async function readSession(): Promise<Session | null> {
  const response = await fetch("/api/me", { cache: "no-store" }).catch(() => undefined);
  const parsed = sessionSchema.safeParse(await response?.json().catch(() => null));
  return response?.status === 200 && parsed.success ? parsed.data.data : null;
}

/** undefined while loading, null when nobody is verified. */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    void readSession().then((found) => current && setSession(found));
    return () => {
      current = false;
    };
  }, []);
  return [session, setSession] as const;
}

export async function saveProfile(profile: SavedProfile): Promise<void> {
  await fetch("/api/me/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  }).catch(() => undefined);
}

async function post(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  }).catch(() => undefined);
  const answer: unknown = await response?.json().catch(() => null);
  return {
    ok: response?.status === 200,
    problem: errorSchema.safeParse(answer).data?.error.message ?? genericProblem,
  };
}

export function EmailVerification({
  session,
  onSession,
  saveDetails,
  onSaveDetailsChange,
}: {
  session: Session | null | undefined;
  onSession: (session: Session | null) => void;
  saveDetails: boolean;
  onSaveDetailsChange: (save: boolean) => void;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  async function run(task: () => Promise<{ ok: boolean; problem: string }>, onDone: () => void | Promise<void>) {
    if (busy) return;
    setBusy(true);
    setProblem(undefined);
    const result = await task();
    if (result.ok) await onDone();
    else setProblem(result.problem);
    setBusy(false);
  }

  const sendCode = () =>
    run(
      () => post("/api/auth/send", { email }),
      () => setCodeSent(true),
    );
  const verifyCode = () =>
    run(
      () => post("/api/auth/verify", { email, code, remember: saveDetails }),
      async () => {
        onSession(await readSession());
        setCode("");
        setCodeSent(false);
      },
    );

  const signInWithGoogle = (credential: string) =>
    run(
      () => post("/api/auth/google", { credential, remember: saveDetails }),
      async () => onSession(await readSession()),
    );

  async function signOut() {
    await post("/api/auth/logout", {});
    onSession(null);
    setEmail("");
  }

  async function deleteSavedDetails() {
    const response = await fetch("/api/me", { method: "DELETE" }).catch(() => undefined);
    if (response?.ok) onSession(null);
  }

  if (session === undefined) return null;

  if (session) {
    return (
      <section className="itinerary-panel booking-panel">
        <div className="panel-heading">
          <span>
            <ShieldCheck size={18} /> Email verified
          </span>
          <span>{session.email}</span>
        </div>
        <div className="itinerary-body">
          <label className="fare-rules-check">
            <input
              type="checkbox"
              checked={saveDetails}
              onChange={(event) => onSaveDetailsChange(event.target.checked)}
            />
            Save my name and mobile number so next time is one tap. You can delete them any time.
          </label>
          <button type="button" className="link-button" onClick={() => void signOut()}>
            Use a different email
          </button>
          {session.profile && (
            <button type="button" className="link-button" onClick={() => void deleteSavedDetails()}>
              Delete my saved details
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="itinerary-panel booking-panel">
      <div className="panel-heading">
        <span>
          <ShieldCheck size={18} /> Verify your email
        </span>
        <span>No password needed</span>
      </div>
      <div className="itinerary-body">
        {googleClientId && (
          <>
            <GoogleSignIn onCredential={(credential) => void signInWithGoogle(credential)} />
            <p className="field-hint">or get a code by email</p>
          </>
        )}
        {!codeSent ? (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void sendCode();
            }}
          >
            <div className="booking-fields">
              <Field label="Email">
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
            </div>
            <button type="submit" className="button button-blue" disabled={busy || !email}>
              {busy ? "Sending…" : "Email me a code"}
            </button>
          </form>
        ) : (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void verifyCode();
            }}
          >
            <p role="status">We sent a 6-digit code to {email}. It lasts 10 minutes.</p>
            <div className="booking-fields">
              <Field label="6-digit code">
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                />
              </Field>
            </div>
            <button type="submit" className="button button-blue" disabled={busy || code.length !== 6}>
              {busy ? "Checking…" : "Verify"}
            </button>
            <button
              type="button"
              className="link-button"
              disabled={busy}
              onClick={() => {
                setCodeSent(false);
                setCode("");
                setProblem(undefined);
              }}
            >
              Use a different email or send a new code
            </button>
          </form>
        )}
        {problem && (
          <p className="booking-problem" role="alert">
            {problem}
          </p>
        )}
        <label className="fare-rules-check">
          <input
            type="checkbox"
            checked={saveDetails}
            onChange={(event) => onSaveDetailsChange(event.target.checked)}
          />
          Remember me: save my name and mobile for faster booking next time. I can delete them any time.
        </label>
        <p className="field-hint">
          We use your email to send this code and your booking updates. We never sell it.
        </p>
      </div>
    </section>
  );
}
