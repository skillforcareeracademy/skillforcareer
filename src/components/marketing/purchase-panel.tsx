"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRight, PlayCircle, Tag, Check, X, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ButtonLink } from "@/components/shared/button-link";

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}
interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
  handler: (resp: RazorpayResponse) => void;
  modal?: { ondismiss?: () => void };
}
type RazorpayCtor = new (options: RazorpayOptions) => { open: () => void };

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if ((window as unknown as { Razorpay?: RazorpayCtor }).Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

interface CheckoutSession {
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  keyId: string | null;
  courseTitle: string;
  prefill: { name: string; email: string };
}

/**
 * The buy box on a course page. Free courses enrol directly; paid courses go
 * through Razorpay checkout (with an optional coupon) and enrol on success.
 */
export function PurchasePanel({
  courseId,
  slug,
  isAuthed,
  isEnrolled,
  isFree,
  price,
}: {
  courseId: string;
  slug: string;
  isAuthed: boolean;
  isEnrolled: boolean;
  isFree: boolean;
  price: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Coupon state (paid courses only).
  const [couponOpen, setCouponOpen] = useState(false);
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [coupon, setCoupon] = useState<{ discount: number; net: number; code: string } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  if (!isAuthed) {
    return (
      <ButtonLink href={`/login?next=/courses/${slug}`} size="lg" className="w-full">
        Sign in to enroll
      </ButtonLink>
    );
  }
  if (isEnrolled) {
    return (
      <ButtonLink href={`/student/learn/${slug}`} size="lg" className="w-full">
        <PlayCircle className="size-4" /> Go to course
      </ButtonLink>
    );
  }

  async function enrollFree() {
    setLoading(true);
    try {
      await api.post("/api/enrollments", { courseId });
      toast.success("You're enrolled! 🎉");
      router.push(`/student/learn/${slug}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't enroll.");
      setLoading(false);
    }
  }

  async function applyCoupon() {
    if (!code.trim()) return;
    setChecking(true);
    setCouponError(null);
    try {
      const r = await api.post<{ valid: boolean; reason?: string; discount?: number; netAmount?: number; code?: string }>(
        "/api/coupons/validate",
        { code, amount: price, courseId },
      );
      if (!r.valid) {
        setCoupon(null);
        setCouponError(r.reason ?? "Invalid coupon code.");
      } else {
        setCoupon({ discount: r.discount ?? 0, net: r.netAmount ?? price, code: r.code ?? code.toUpperCase() });
      }
    } catch (err) {
      setCouponError(err instanceof ApiError ? err.message : "Couldn't check that code.");
    } finally {
      setChecking(false);
    }
  }

  async function buy() {
    setLoading(true);
    try {
      const session = await api.post<CheckoutSession>("/api/payments/checkout", {
        courseId,
        couponCode: coupon?.code,
      });
      if (!session.keyId) {
        toast.error("Online payments aren't set up yet. Please contact support.");
        setLoading(false);
        return;
      }
      const ready = await loadRazorpay();
      if (!ready) {
        toast.error("Couldn't load the payment window. Check your connection.");
        setLoading(false);
        return;
      }
      const Razorpay = (window as unknown as { Razorpay: RazorpayCtor }).Razorpay;
      const rzp = new Razorpay({
        key: session.keyId,
        amount: session.amount,
        currency: session.currency,
        name: "SkillForCareer",
        description: session.courseTitle,
        order_id: session.orderId,
        prefill: session.prefill,
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
            router.push(`/student/learn/${slug}`);
          } catch (err) {
            // The webhook will still reconcile; tell the learner it's processing.
            toast.error(
              err instanceof ApiError
                ? err.message
                : "Payment received — enrolment is being confirmed.",
            );
            router.refresh();
          }
        },
        modal: { ondismiss: () => setLoading(false) },
      });
      rzp.open();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't start checkout.");
      setLoading(false);
    }
  }

  if (isFree) {
    return (
      <Button onClick={enrollFree} disabled={loading} size="lg" className="w-full">
        {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
        Enroll for free
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      {/* Coupon */}
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
                setCode("");
              }}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Remove coupon"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="mt-1.5 flex items-baseline gap-2">
            <span className="text-lg font-bold">₹{coupon.net.toLocaleString("en-IN")}</span>
            <span className="text-muted-foreground text-xs">
              (₹{coupon.discount.toLocaleString("en-IN")} off)
            </span>
          </p>
        </div>
      ) : couponOpen ? (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setCouponError(null);
              }}
              placeholder="Enter coupon code"
              className="font-mono"
              onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
            />
            <Button type="button" variant="outline" onClick={applyCoupon} disabled={checking || !code.trim()}>
              {checking ? <Loader2 className="size-4 animate-spin" /> : "Apply"}
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

      <Button onClick={buy} disabled={loading} size="lg" className="w-full">
        {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
        Buy now · ₹{(coupon?.net ?? price).toLocaleString("en-IN")}
      </Button>
      <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
        <ShieldCheck className="size-3.5" /> Secure payment via Razorpay
      </p>
    </div>
  );
}
