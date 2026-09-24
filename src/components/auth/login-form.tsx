"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Lock, Mail } from "lucide-react";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";
import { api, ApiError } from "@/lib/api-client";
import { useAuthStore, type SessionUser } from "@/stores/auth-store";
import { AuthCard } from "./auth-card";
import { CodeLogin } from "./code-login";
import { Field } from "./field";
import { IconInput } from "./icon-input";
import { PasswordInput } from "./password-input";
import { SubmitButton } from "./submit-button";
import { ROUTES } from "@/lib/constants";
import { destinationFor, safeNext } from "@/lib/auth/next-url";
import { cn } from "@/lib/utils";

type Mode = "password" | "code";

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
  const [mode, setMode] = useState<Mode>("password");
  // Whatever was typed in the password tab's email carries over to the code tab.
  const [codeEmail, setCodeEmail] = useState("");
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  function switchMode(next: Mode) {
    if (next === "code") setCodeEmail(getValues("email") ?? "");
    setMode(next);
  }

  function signedIn(user: SessionUser) {
    setUser(user);
    toast.success(`Welcome back, ${user.name.split(" ")[0]}!`);
    router.replace(destinationFor(user.role, next));
  }

  async function onSubmit(values: LoginInput) {
    try {
      const { user } = await api.post<{ user: SessionUser }>(
        "/api/auth/login",
        values,
      );
      signedIn(user);
    } catch (e) {
      if (e instanceof ApiError) {
        const details = e.details as
          { reason?: string; email?: string } | undefined;
        if (details?.reason === "EMAIL_NOT_VERIFIED") {
          toast.info("Please verify your email first. Sending a new code…");
          await api
            .post("/api/auth/resend-otp", {
              email: details.email,
              purpose: "verify-email",
            })
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
            href={
              next
                ? `${ROUTES.register}?next=${encodeURIComponent(next)}`
                : ROUTES.register
            }
          >
            Create an account
          </Link>
        </span>
      }
    >
      <div
        role="tablist"
        aria-label="How to sign in"
        className="bg-muted mb-5 grid grid-cols-2 gap-1 rounded-lg p-1"
      >
        {(
          [
            { value: "password", label: "Password", icon: Lock },
            { value: "code", label: "Email code", icon: Mail },
          ] as const
        ).map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => switchMode(value)}
            className={cn(
              "flex h-9 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors",
              mode === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon
              className={cn("size-4", mode === value && "text-primary")}
              aria-hidden
            />
            {label}
          </button>
        ))}
      </div>

      {mode === "code" ? (
        <CodeLogin initialEmail={codeEmail} onSignedIn={signedIn} />
      ) : (
        // method="post" so a submit that beats hydration can never put the
        // password in the URL as a query string.
        <form method="post" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
          <Field
            label="Password"
            htmlFor="password"
            error={errors.password?.message}
          >
            <PasswordInput
              id="password"
              autoComplete="current-password"
              placeholder="••••••••"
              {...register("password")}
            />
          </Field>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => switchMode("code")}
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              Sign in with an email code
            </button>
            <Link
              href={ROUTES.forgotPassword}
              className="text-primary text-sm font-medium hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <SubmitButton loading={isSubmitting} className="h-11">
            Sign in
          </SubmitButton>
        </form>
      )}
    </AuthCard>
  );
}
