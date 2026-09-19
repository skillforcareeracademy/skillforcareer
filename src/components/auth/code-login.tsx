"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Mail, Send } from "lucide-react";
import { emailSchema } from "@/lib/validations/auth";
import { api, ApiError } from "@/lib/api-client";
import type { SessionUser } from "@/stores/auth-store";
import { Field } from "./field";
import { IconInput } from "./icon-input";
import { OtpInput } from "./otp-input";
import { SubmitButton } from "./submit-button";

/**
 * Seconds before "Resend code" comes back — five minutes, the same as the
 * server, which won't email another code sooner. A code stays valid for ten.
 */
const RESEND_AFTER = 5 * 60;
const CODE_LENGTH = 6;

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Sign in with a one-time code emailed to the address — for a learner who has
 * forgotten their password, or bought through express checkout and never set
 * one. Step one asks for the email; step two takes the code.
 */
export function CodeLogin({
  initialEmail = "",
  onSignedIn,
}: {
  initialEmail?: string;
  onSignedIn: (user: SessionUser) => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [emailError, setEmailError] = useState<string>();
  /** The address a code went to; null until one has been sent. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const lastTried = useRef<string>("");

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? "Enter a valid email");
      return;
    }
    setEmailError(undefined);
    setSending(true);
    try {
      const res = await api.post<{ devOtp?: string }>(
        "/api/auth/request-code",
        { email: parsed.data },
      );
      setSentTo(parsed.data);
      setCode("");
      lastTried.current = "";
      setResendIn(RESEND_AFTER);
      if (res.devOtp) toast.info(`Dev code: ${res.devOtp}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Couldn't send the code. Try again.",
      );
    } finally {
      setSending(false);
    }
  }

  async function verify(event?: FormEvent) {
    event?.preventDefault();
    if (!sentTo || verifying) return;
    if (code.length !== CODE_LENGTH) {
      toast.error("Enter the 6-digit code from the email.");
      return;
    }
    lastTried.current = code;
    setVerifying(true);
    try {
      const { user } = await api.post<{ user: SessionUser }>(
        "/api/auth/verify-code",
        { email: sentTo, code },
      );
      onSignedIn(user);
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Couldn't sign you in. Try again.",
      );
      setVerifying(false);
    }
  }

  // The last digit in (typed or pasted) signs in without another click — once
  // per code, so a wrong one isn't re-sent until it is changed.
  useEffect(() => {
    if (
      sentTo &&
      code.length === CODE_LENGTH &&
      code !== lastTried.current &&
      !verifying
    )
      void verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, sentTo]);

  if (!sentTo) {
    return (
      <form onSubmit={send} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="code-email" error={emailError}>
          <IconInput
            id="code-email"
            icon={Mail}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <p className="text-muted-foreground text-sm">
          We&apos;ll email you a 6-digit code. No password needed.
        </p>
        <SubmitButton loading={sending} className="h-11">
          Send code
        </SubmitButton>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-5">
      <div className="bg-muted/60 flex items-start gap-3 rounded-lg p-3 text-sm">
        <Send className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
        <p className="flex-1">
          If <span className="font-medium">{sentTo}</span> has an account, a
          code is on its way. Check spam too.
        </p>
        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setCode("");
          }}
          className="text-primary shrink-0 font-medium hover:underline"
        >
          Change
        </button>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Code from the email</p>
        <OtpInput
          value={code}
          onChange={setCode}
          length={CODE_LENGTH}
          autoFocus
          disabled={verifying}
        />
      </div>
      <SubmitButton loading={verifying} className="h-11">
        Verify and sign in
      </SubmitButton>
      <p className="text-muted-foreground text-center text-sm">
        {resendIn > 0 ? (
          <>Didn&apos;t get it? You can ask again in {clock(resendIn)}</>
        ) : (
          <>
            Didn&apos;t get it?{" "}
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending}
              className="text-primary font-medium hover:underline disabled:opacity-50"
            >
              Resend code
            </button>
          </>
        )}
      </p>
    </form>
  );
}
