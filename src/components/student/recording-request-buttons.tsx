"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import {
  loadRazorpay,
  openRazorpay,
  type CheckoutSession,
} from "@/lib/razorpay-checkout";
import { Button } from "@/components/ui/button";

/** Ask a super admin to share a recording this learner can't currently watch. */
export function RequestRecordingButton({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function request() {
    setBusy(true);
    try {
      await api.post(`/api/recordings/${meetingId}/request`);
      toast.success("Requested — we'll let you know once it's shared.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't send that request.");
      setBusy(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="w-full"
      onClick={() => void request()}
      disabled={busy}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
      Request recording
    </Button>
  );
}

/** Pay the price a super admin set to unlock a shared recording. */
export function RecordingUnlockButton({
  requestId,
  price,
}: {
  requestId: string;
  price: number | null;
}) {
  const router = useRouter();
  const [paying, setPaying] = useState(false);

  async function pay() {
    setPaying(true);
    try {
      const checkout = await api.post<CheckoutSession>(
        `/api/recordings/requests/${requestId}/checkout`,
      );
      if (!checkout.keyId) {
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
        key: checkout.keyId,
        amount: checkout.amount,
        currency: checkout.currency,
        name: "SkillForCareer",
        description: checkout.courseTitle,
        order_id: checkout.orderId,
        prefill: checkout.prefill,
        theme: { color: "#e11d48" },
        handler: async (resp) => {
          try {
            await api.post("/api/payments/verify", {
              paymentId: checkout.paymentId,
              razorpayOrderId: resp.razorpay_order_id,
              razorpayPaymentId: resp.razorpay_payment_id,
              razorpaySignature: resp.razorpay_signature,
            });
            toast.success("Payment received — the recording is unlocked.");
          } catch {
            // The webhook reconciles, so this isn't a failure.
            toast.info("Payment received — the recording will unlock shortly.");
          }
          router.refresh();
          setPaying(false);
        },
        modal: { ondismiss: () => setPaying(false) },
      });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't start the payment.");
      setPaying(false);
    }
  }

  return (
    <Button size="sm" className="w-full" onClick={() => void pay()} disabled={paying}>
      {paying ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <CreditCard className="size-4" />
      )}
      Pay ₹{(price ?? 0).toLocaleString("en-IN")} to unlock
    </Button>
  );
}
