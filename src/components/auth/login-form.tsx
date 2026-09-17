"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { api, ApiError } from "@/lib/api-client";
import { useAuthStore, type SessionUser } from "@/stores/auth-store";
import { AuthCard } from "./auth-card";
import { Field } from "./field";
import { IconInput } from "./icon-input";
import { PasswordInput } from "./password-input";
import { SubmitButton } from "./submit-button";
import { ROUTES } from "@/lib/constants";
import { destinationFor, safeNext } from "@/lib/auth/next-url";

export function LoginForm({
  next,
  title = "Welcome back",
  description = "Sign in to continue learning.",
}: {
  next?: string;
  /** Both come from Admin → Homepage → Sign-in panel. */
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  // Carried on to the verify screen too, so an unverified buyer who has to
  // detour through OTP still lands back on the checkout they came from.
  const nextQuery = safeNext(next) ? `&next=${encodeURIComponent(next!)}` : "";
  const setUser = useAuthStore((s) => s.setUser);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    try {
      const { user } = await api.post<{ user: SessionUser }>(
        "/api/auth/login",
        values,
      );
      setUser(user);
      toast.success(`Welcome back, ${user.name.split(" ")[0]}!`);
      router.replace(destinationFor(user.role, next));
    } catch (e) {
      if (e instanceof ApiError) {
        const details = e.details as { reason?: string; email?: string } | undefined;
        if (details?.reason === "EMAIL_NOT_VERIFIED") {
          toast.info("Please verify your email first. Sending a new code…");
          await api
            .post("/api/auth/resend-otp", { email: details.email, purpose: "verify-email" })
            .catch(() => {});
          router.push(
            `${ROUTES.verifyOtp}?email=${encodeURIComponent(details.email ?? values.email)}${nextQuery}`,
          );
          return;
        }
        toast.error(e.message);
      } else {
        toast.error("Something went wrong.");
      }
    }
  }

  return (
    <AuthCard
      title={title}
      description={description}
      footer={
        <span className="text-muted-foreground">
          New here?{" "}
          <Link
            className="text-primary font-medium"
            href={next ? `${ROUTES.register}?next=${encodeURIComponent(next)}` : ROUTES.register}
          >
            Create an account
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <IconInput
            id="email"
            icon={Mail}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...register("email")}
          />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="••••••••"
            {...register("password")}
          />
        </Field>
        <div className="flex justify-end">
          <Link href={ROUTES.forgotPassword} className="text-primary text-sm font-medium hover:underline">
            Forgot password?
          </Link>
        </div>
        <SubmitButton loading={isSubmitting} className="h-11">
          Sign in
        </SubmitButton>
      </form>
    </AuthCard>
  );
}
