"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { User, Mail } from "lucide-react";
import { registerSchema, type RegisterInput } from "@/lib/validations/auth";
import { api, ApiError } from "@/lib/api-client";
import { AuthCard } from "./auth-card";
import { Field } from "./field";
import { IconInput } from "./icon-input";
import { PasswordInput } from "./password-input";
import { SubmitButton } from "./submit-button";
import { ROUTES } from "@/lib/constants";

export function RegisterForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(values: RegisterInput) {
    try {
      const res = await api.post<{ email: string; devOtp?: string }>(
        "/api/auth/register",
        values,
      );
      toast.success("Verification code sent to your email.");
      if (res.devOtp) toast.info(`Dev code: ${res.devOtp}`);
      router.push(`${ROUTES.verifyOtp}?email=${encodeURIComponent(res.email)}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Something went wrong.");
    }
  }

  return (
    <AuthCard
      title="Create your account"
      description="Start learning in minutes."
      footer={
        <span className="text-muted-foreground">
          Already have an account?{" "}
          <Link className="text-primary font-medium" href={ROUTES.login}>
            Sign in
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label="Full name" htmlFor="name" error={errors.name?.message}>
          <IconInput id="name" icon={User} autoComplete="name" placeholder="Aarav Mehta" {...register("name")} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <IconInput id="email" icon={Mail} type="email" autoComplete="email" placeholder="you@example.com" {...register("email")} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <PasswordInput id="password" autoComplete="new-password" placeholder="••••••••" {...register("password")} />
        </Field>
        <Field
          label="Confirm password"
          htmlFor="confirmPassword"
          error={errors.confirmPassword?.message}
        >
          <PasswordInput id="confirmPassword" autoComplete="new-password" placeholder="••••••••" {...register("confirmPassword")} />
        </Field>
        <SubmitButton loading={isSubmitting} className="h-11">
          Create account
        </SubmitButton>
      </form>
    </AuthCard>
  );
}
