"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Layers,
  Loader2,
  Lock,
  ShieldCheck,
  Tag,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import {
  loadRazorpay,
  openRazorpay,
  type CheckoutSession,
} from "@/lib/razorpay-checkout";
import { useAuthStore, type SessionUser } from "@/stores/auth-store";
import type { CheckoutCourse } from "@/server/services/checkout-service";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PasswordInput } from "@/components/auth/password-input";
import { OtpInput } from "@/components/auth/otp-input";
import { PhoneInput } from "@/components/shared/phone-input";
import { cn } from "@/lib/utils";
import { imageProps } from "@/lib/image-sizes";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * What the identity step is currently asking for.
 *
 * `details` is where everyone starts. A brand-new email is signed up and signed
 * in on the spot and jumps straight to `done` — that is the client's "student
 * ko pata bhi na chale aur sign up ho jaaye". An email the platform already
 * knows has to be proved first, with the password if the account has one and
 * with an emailed code if it doesn't, because knowing an address is not a
 * credential.
 */
type IdentityStep = "details" | "password" | "code" | "done";

export function CheckoutPanel({
  course,
  user,
}: {
  course: CheckoutCourse;
  user: { name: string; email: string } | null;
}) {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  const [step, setStep] = useState<IdentityStep>(user ? "done" : "details");
  const [buyer, setBuyer] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    phone: "",
  });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [identifying, setIdentifying] = useState(false);

  const [paying, setPaying] = useState(false);
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [coupon, setCoupon] = useState<{ discount: number; net: number; code: string } | null>(
    null,
  );
  const [couponError, setCouponError] = useState<string | null>(null);

  const payable = coupon?.net ?? course.effectivePrice;

  function set<K extends keyof typeof buyer>(key: K, value: string) {
    setBuyer((b) => ({ ...b, [key]: value }));
  }

  function signedIn(session: SessionUser) {
    setUser(session);
    setBuyer((b) => ({ ...b, name: session.name, email: session.email }));
    setStep("done");
  }

  // ── Step 1 — who is buying ────────────────────────────────────────────────

  async function identify(e: FormEvent) {
    e.preventDefault();
    setIdentifying(true);
    try {
      const res = await api.post<{
        status: "SIGNED_IN" | "PASSWORD_REQUIRED" | "CODE_SENT";
        user?: SessionUser;
        name?: string;
        email?: string;
        devOtp?: string;
      }>("/api/checkout/identify", buyer);

      if (res.status === "SIGNED_IN" && res.user) {
        signedIn(res.user);
        return;
      }
      if (res.status === "PASSWORD_REQUIRED") {
        toast.info("You've been here before — enter your password to continue.");
        setStep("password");
        return;
      }
      toast.info(`We've emailed a 6-digit code to ${res.email ?? buyer.email}.`);
      if (res.devOtp) toast.info(`Dev code: ${res.devOtp}`);
      setStep("code");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't continue. Try again.");
    } finally {
      setIdentifying(false);
    }
  }

  async function signInWithPassword(e: FormEvent) {
    e.preventDefault();
    setIdentifying(true);
    try {
      const { user: session } = await api.post<{ user: SessionUser }>("/api/auth/login", {
        email: buyer.email,
        password,
      });
      signedIn(session);
      setPassword("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't sign you in.");
    } finally {
      setIdentifying(false);
    }
  }

  async function signInWithCode(e: FormEvent) {
    e.preventDefault();
    if (code.length !== 6) {
      toast.error("Enter the 6-digit code.");
      return;
    }
    setIdentifying(true);
    try {
      const { user: session } = await api.post<{ user: SessionUser }>(
        "/api/checkout/verify-code",
        { email: buyer.email, code },
      );
      signedIn(session);
      setCode("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "That code didn't work.");
    } finally {
      setIdentifying(false);
    }
  }

  // ── Step 2 — the money ────────────────────────────────────────────────────

  async function applyCoupon() {
    if (!couponCode.trim()) return;
    setCheckingCoupon(true);
    setCouponError(null);
    try {
      const r = await api.post<{
        valid: boolean;
        reason?: string;
        discount?: number;
        netAmount?: number;
        code?: string;
      }>("/api/coupons/validate", {
        code: couponCode,
        amount: course.effectivePrice,
        courseId: course.id,
      });
      if (!r.valid) {
        setCoupon(null);
        setCouponError(r.reason ?? "Invalid coupon code.");
      } else {
        setCoupon({
          discount: r.discount ?? 0,
          net: r.netAmount ?? course.effectivePrice,
          code: r.code ?? couponCode.toUpperCase(),
        });
      }
    } catch (err) {
      setCouponError(err instanceof ApiError ? err.message : "Couldn't check that code.");
    } finally {
      setCheckingCoupon(false);
    }
  }

  async function enrollFree() {
    setPaying(true);
    try {
      await api.post("/api/enrollments", { courseId: course.id });
      toast.success("You're enrolled! 🎉");
      router.push(`/student/learn/${course.slug}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't enroll.");
      setPaying(false);
    }
  }

  async function payNow() {
    setPaying(true);
    try {
      const session = await api.post<CheckoutSession>("/api/payments/checkout", {
        courseId: course.id,
        couponCode: coupon?.code,
      });
      if (!session.keyId) {
        toast.error("Online payments aren't set up yet. Please contact support.");
        setPaying(false);
        return;
      }
      const ready = await loadRazorpay();
      if (!ready) {
        toast.error("Couldn't load the payment window. Check your connection.");
        setPaying(false);
        return;
      }
      openRazorpay({
        key: session.keyId,
        amount: session.amount,
        currency: session.currency,
        name: "SkillForCareer",
        description: session.courseTitle ?? course.title,
        order_id: session.orderId,
        prefill: { ...session.prefill, contact: buyer.phone || undefined },
        theme: { color: "#e11d48" },
        handler: async (resp) => {
          try {
            await api.post("/api/payments/verify", {
              paymentId: session.paymentId,
              razorpayOrderId: resp.razorpay_order_id,
              razorpayPaymentId: resp.razorpay_payment_id,
              razorpaySignature: resp.razorpay_signature,
            });
            toast.success("Payment successful — you're enrolled! 🎉");
            router.push(`/student/learn/${course.slug}`);
          } catch (err) {
            // The webhook still reconciles; say it's processing rather than failed.
            toast.error(
              err instanceof ApiError
                ? err.message
                : "Payment received — enrolment is being confirmed.",
            );
            router.refresh();
          }
        },
        modal: { ondismiss: () => setPaying(false) },
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't start checkout.");
      setPaying(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const ready = step === "done";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
      {/* ── The form ──────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Complete your enrolment
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Two steps — your details, then payment. No separate sign-up needed.
          </p>
        </div>

        <StepCard
          n={1}
          title="Your details"
          done={ready}
          active={!ready}
          summary={ready ? `${buyer.name} · ${buyer.email}` : undefined}
        >
          {step === "details" && (
            <form onSubmit={identify} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="co-name">Full name</Label>
                <Input
                  id="co-name"
                  value={buyer.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="co-email">Email</Label>
                  <Input
                    id="co-email"
                    type="email"
                    value={buyer.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone number</Label>
                  <PhoneInput value={buyer.phone} onChange={(v) => set("phone", v)} />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={identifying}>
                {identifying ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowRight className="size-4" />
                )}
                Continue to payment
              </Button>
              <p className="text-muted-foreground text-center text-xs">
                We create your learner account from these details — your invoice and
                course access go to this email.
              </p>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={signInWithPassword} className="space-y-3">
              <p className="text-muted-foreground text-sm">
                <span className="text-foreground font-medium">{buyer.email}</span> already
                has an account. Enter its password to carry on.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="co-pass">Password</Label>
                <PasswordInput
                  id="co-pass"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={identifying}>
                {identifying ? <Loader2 className="size-4 animate-spin" /> : null}
                Sign in and continue
              </Button>
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setStep("details")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Use a different email
                </button>
                <a href="/forgot-password" className="text-primary font-medium">
                  Forgot password?
                </a>
              </div>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={signInWithCode} className="space-y-4">
              <p className="text-muted-foreground text-sm">
                We already have an account for{" "}
                <span className="text-foreground font-medium">{buyer.email}</span>. Enter
                the 6-digit code we just emailed to confirm it&apos;s you.
              </p>
              <OtpInput value={code} onChange={setCode} autoFocus />
              <Button type="submit" className="w-full" disabled={identifying}>
                {identifying ? <Loader2 className="size-4 animate-spin" /> : null}
                Verify and continue
              </Button>
              <button
                type="button"
                onClick={() => setStep("details")}
                className="text-muted-foreground hover:text-foreground w-full text-center text-xs"
              >
                Use a different email
              </button>
            </form>
          )}
        </StepCard>

        <StepCard n={2} title="Payment" done={false} active={ready}>
          {ready ? (
            course.isFree ? (
              <div className="space-y-3">
                <p className="text-muted-foreground text-sm">
                  This program is free — nothing to pay.
                </p>
                <Button onClick={enrollFree} disabled={paying} size="lg" className="w-full">
                  {paying ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowRight className="size-4" />
                  )}
                  Start learning
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {coupon ? (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-50 p-3 text-sm dark:bg-emerald-500/10">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-300">
                        <Check className="size-4" /> {coupon.code} applied
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setCoupon(null);
                          setCouponCode("");
                        }}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Remove coupon"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                      {inr(coupon.discount)} off
                    </p>
                  </div>
                ) : couponOpen ? (
                  <div className="space-y-1.5">
                    <div className="flex gap-2">
                      <Input
                        value={couponCode}
                        onChange={(e) => {
                          setCouponCode(e.target.value.toUpperCase());
                          setCouponError(null);
                        }}
                        placeholder="Enter coupon code"
                        className="font-mono"
                        onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={applyCoupon}
                        disabled={checkingCoupon || !couponCode.trim()}
                      >
                        {checkingCoupon ? <Loader2 className="size-4 animate-spin" /> : "Apply"}
                      </Button>
                    </div>
                    {couponError && <p className="text-destructive text-xs">{couponError}</p>}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCouponOpen(true)}
                    className="text-primary flex items-center gap-1.5 text-sm font-medium hover:underline"
                  >
                    <Tag className="size-4" /> Have a coupon code?
                  </button>
                )}

                <Button onClick={payNow} disabled={paying} size="lg" className="w-full">
                  {paying ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Lock className="size-4" />
                  )}
                  Pay now · {inr(payable)}
                </Button>
                <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
                  <ShieldCheck className="size-3.5" /> Secure payment via Razorpay · UPI,
                  cards, net banking
                </p>
              </div>
            )
          ) : (
            <p className="text-muted-foreground text-sm">
              Fill in your details above and this opens up.
            </p>
          )}
        </StepCard>
      </div>

      {/* ── Order summary ─────────────────────────────────────────────────── */}
      <Card className="lg:sticky lg:top-6">
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="bg-muted relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg">
              {course.thumbnailUrl ? (
                // Not next/image: thumbnails come from arbitrary hosts.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  {...imageProps(course.thumbnailUrl, 96)}
                  alt={course.title}
                  className="size-full object-cover"
                />
              ) : (
                <div className="text-muted-foreground flex size-full items-center justify-center">
                  <BookOpen className="size-5" aria-hidden />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm leading-snug font-semibold">
                {course.title}
              </p>
              <p className="text-muted-foreground mt-0.5 truncate text-xs">
                {course.instructorName}
              </p>
            </div>
          </div>

          <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span className="flex items-center gap-1">
              <Layers className="size-3.5" /> {course.lessons} lessons
            </span>
            {course.durationMinutes > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" />
                {Math.floor(course.durationMinutes / 60)}h {course.durationMinutes % 60}m
              </span>
            )}
          </div>

          <Separator />

          {course.isFree ? (
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">Total</span>
              <span className="text-2xl font-bold">Free</span>
            </div>
          ) : (
            <div className="space-y-2">
              <Row label="Course price" value={inr(course.price)} />
              {course.discountPrice != null && course.discountPrice < course.price && (
                <Row
                  label="Launch discount"
                  value={`− ${inr(course.price - course.discountPrice)}`}
                  tone="positive"
                />
              )}
              {coupon && (
                <Row
                  label={`Coupon ${coupon.code}`}
                  value={`− ${inr(coupon.discount)}`}
                  tone="positive"
                />
              )}
              <Separator />
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">Total payable</span>
                <span className="text-2xl font-bold">{inr(payable)}</span>
              </div>
            </div>
          )}

          <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            Lifetime access, 30-day money-back guarantee.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground min-w-0 truncate">{label}</span>
      <span
        className={cn(
          "font-medium",
          tone === "positive" && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** One numbered step of the checkout, collapsed to a summary once it's done. */
function StepCard({
  n,
  title,
  done,
  active,
  summary,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  active: boolean;
  summary?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn(!active && !done && "opacity-70")}>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
              done
                ? "bg-emerald-600 text-white"
                : active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {done ? <CheckCircle2 className="size-4" /> : n}
          </span>
          <div className="min-w-0">
            <p className="font-semibold">{title}</p>
            {summary && (
              <p className="text-muted-foreground truncate text-xs">{summary}</p>
            )}
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
