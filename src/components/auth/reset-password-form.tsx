"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { passwordSchema } from "@/lib/validations/auth";
import { api, ApiError } from "@/lib/api-client";
import { AuthCard } from "./auth-card";
import { Field } from "./field";
import { OtpInput } from "./otp-input";
import { PasswordInput } from "./password-input";
import { SubmitButton } from "./submit-button";
import { ButtonLink } from "@/components/shared/button-link";
import { ROUTES } from "@/lib/constants";

const formSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
type FormValues = z.infer<typeof formSchema>;

export function ResetPasswordForm({ email }: { email?: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  if (!email) {
    return (
      <AuthCard
        title="Reset password"
        description="We couldn't tell which account to reset. Start again."
      >
        <ButtonLink href={ROUTES.forgotPassword} className="w-full">
          Request a reset code
        </ButtonLink>
      </AuthCard>
    );
  }

  async function onSubmit(values: FormValues) {
    if (code.length !== 6) {
      toast.error("Enter the 6-digit code.");
      return;
    }
    try {
      await api.post("/api/auth/reset-password", {
        email,
        code,
        password: values.password,
        confirmPassword: values.confirmPassword,
      });
      toast.success("Password updated. Please sign in.");
      router.replace(ROUTES.login);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Something went wrong.");
    }
  }

  return (
    <AuthCard
      title="Set a new password"
      description={`Enter the code sent to ${email} and choose a new password.`}
      footer={
        <Link className="text-primary font-medium" href={ROUTES.login}>
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm font-medium">Verification code</p>
          <OtpInput value={code} onChange={setCode} autoFocus />
        </div>
        <Field label="New password" htmlFor="password" error={errors.password?.message}>
          <PasswordInput id="password" autoComplete="new-password" {...register("password")} />
        </Field>
        <Field
          label="Confirm password"
          htmlFor="confirmPassword"
          error={errors.confirmPassword?.message}
        >
          <PasswordInput id="confirmPassword" autoComplete="new-password" {...register("confirmPassword")} />
        </Field>
        <SubmitButton loading={isSubmitting} className="h-11">
          Update password
        </SubmitButton>
      </form>
    </AuthCard>
  );
}
