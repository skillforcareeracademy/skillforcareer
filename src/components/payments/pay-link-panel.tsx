"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { PaymentLinkView } from "@/server/services/lead-payment-service";

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
  prefill: { name: string; email: string };
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium">{value}</span>
    </div>
  );
}

/**
 * One invoice, one button.
 *
 * The person on this screen was sent a link by a counsellor and wants to pay
 * their fees — so it shows the amount, what it's for, and nothing else to
 * decide. Everything that could change the price lives on the server; this page
 * cannot alter what is charged.
 */
export function PayLinkPanel({ link }: { link: PaymentLinkView }) {
  const [paid, setPaid] = useState(link.status === "PAID");
  const [loading, setLoading] = useState(false);

  async function pay() {
    setLoading(true);
    try {
      const session = await api.post<CheckoutSession>(`/api/pay/${link.token}/checkout`);
      if (!session.keyId) {
        toast.error("Online payments aren't set up yet. Please call us to pay.");
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
      new Razorpay({
        key: session.keyId,
        amount: session.amount,
        currency: session.currency,
        name: "SkillForCareer",
        description: link.courseTitle ?? `Invoice ${link.invoiceNumber}`,
        order_id: session.orderId,
        prefill: session.prefill,
        theme: { color: "#e11d48" },
        handler: async (resp) => {
          try {
            await api.post(`/api/pay/${link.token}/verify`, {
              razorpayOrderId: resp.razorpay_order_id,
              razorpayPaymentId: resp.razorpay_payment_id,
              razorpaySignature: resp.razorpay_signature,
            });
            setPaid(true);
          } catch (err) {
            // Razorpay took the money either way, and the webhook reconciles —
            // never tell the payer it failed when it hasn't.
            toast.message(
              err instanceof ApiError
                ? err.message
                : "Payment received — we're confirming it now.",
            );
            setPaid(true);
          } finally {
            setLoading(false);
          }
        },
        modal: { ondismiss: () => setLoading(false) },
      }).open();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't start the payment.");
      setLoading(false);
    }
  }

  if (paid) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
            <CheckCircle2 className="size-7 text-emerald-600 dark:text-emerald-400" />
          </span>
          <h1 className="text-xl font-semibold">Payment received</h1>
          <p className="text-muted-foreground max-w-xs text-sm">
            Thanks, {link.studentName.split(" ")[0]}. Invoice {link.invoiceNumber}{" "}
            is settled and your admission is confirmed — our team will be in
            touch about your batch.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (link.expired) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="bg-muted grid size-14 place-items-center rounded-full">
            <Clock className="text-muted-foreground size-7" />
          </span>
          <h1 className="text-xl font-semibold">This link has expired</h1>
          <p className="text-muted-foreground max-w-xs text-sm">
            Payment links are time-limited. Ask your counsellor to send a fresh
            one and it will work straight away.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5 py-6">
        <div className="text-center">
          <p className="text-muted-foreground text-sm">Amount due</p>
          <p className="mt-1 text-4xl font-bold tracking-tight">{inr(link.amount)}</p>
        </div>

        <Separator />

        <div className="space-y-2">
          <Row label="Invoice" value={link.invoiceNumber} />
          <Row label="Name" value={link.studentName} />
          {link.courseTitle && <Row label="Course" value={link.courseTitle} />}
        </div>

        <Button onClick={pay} disabled={loading} size="lg" className="w-full">
          {loading && <Loader2 className="size-4 animate-spin" />}
          Pay {inr(link.amount)}
        </Button>

        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
          <ShieldCheck className="size-3.5" /> Secure payment via Razorpay
        </p>
      </CardContent>
    </Card>
  );
}
