"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from "@/lib/validations/auth";
import { Mail } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { AuthCard } from "./auth-card";
import { Field } from "./field";
import { IconInput } from "./icon-input";
import { SubmitButton } from "./submit-button";
import { ROUTES } from "@/lib/constants";

export function ForgotPasswordForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onSubmit(values: ForgotPasswordInput) {
    try {
      const res = await api.post<{ email: string; devOtp?: string }>(
        "/api/auth/forgot-password",
        values,
      );
      toast.success("If an account exists, a reset code has been sent.");
      if (res.devOtp) toast.info(`Dev code: ${res.devOtp}`);
      router.push(`${ROUTES.resetPassword}?email=${encodeURIComponent(res.email)}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Something went wrong.");
    }
  }

  return (
    <AuthCard
      title="Forgot password?"
      description="Enter your email and we'll send a reset code."
      footer={
        <Link className="text-primary font-medium" href={ROUTES.login}>
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <IconInput id="email" icon={Mail} type="email" autoComplete="email" placeholder="you@example.com" {...register("email")} />
        </Field>
        <SubmitButton loading={isSubmitting} className="h-11">
          Send reset code
        </SubmitButton>
      </form>
    </AuthCard>
  );
}
