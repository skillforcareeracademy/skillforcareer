"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { useAuthStore, type SessionUser } from "@/stores/auth-store";
import { ROLE_HOME } from "@/config/roles";
import { AuthCard } from "./auth-card";
import { OtpInput } from "./otp-input";
import { SubmitButton } from "./submit-button";
import { ButtonLink } from "@/components/shared/button-link";
import { ROUTES } from "@/lib/constants";

export function VerifyOtpForm({ email }: { email?: string }) {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  if (!email) {
    return (
      <AuthCard
        title="Verify your email"
        description="We couldn't tell which email to verify. Please register first."
      >
        <ButtonLink href={ROUTES.register} className="w-full">
          Go to sign up
        </ButtonLink>
      </AuthCard>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (code.length !== 6) {
      toast.error("Enter the 6-digit code.");
      return;
    }
    setLoading(true);
    try {
      const { user } = await api.post<{ user: SessionUser }>(
        "/api/auth/verify-otp",
        { email, code, purpose: "verify-email" },
      );
      setUser(user);
      toast.success("Email verified! Welcome aboard.");
      router.replace(ROLE_HOME[user.role] ?? ROUTES.student);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setResending(true);
    try {
      const res = await api.post<{ devOtp?: string }>("/api/auth/resend-otp", {
        email,
        purpose: "verify-email",
      });
      toast.success("A new code is on the way.");
      if (res.devOtp) toast.info(`Dev code: ${res.devOtp}`);
    } catch {
      toast.error("Couldn't resend. Try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthCard
      title="Verify your email"
      description={`Enter the 6-digit code sent to ${email}.`}
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <OtpInput value={code} onChange={setCode} autoFocus />
        <SubmitButton loading={loading}>Verify &amp; continue</SubmitButton>
      </form>
      <p className="text-muted-foreground mt-4 text-center text-sm">
        Didn&apos;t get it?{" "}
        <button
          type="button"
          onClick={resend}
          disabled={resending}
          className="text-primary font-medium disabled:opacity-50"
        >
          Resend code
        </button>
      </p>
    </AuthCard>
  );
}
