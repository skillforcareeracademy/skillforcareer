"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import {
  loadRazorpay,
  openRazorpay,
  type CheckoutSession,
} from "@/lib/razorpay-checkout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

type Choice = "FULL" | "NEXT" | "CUSTOM";

interface Options {
  full: number;
  next: number;
  penalty: number;
}

/**
 * "Pay now", from the learner's own panel.
 *
 * Three ways, because those are the three things people do: clear the lot, put
 * the next instalment in early, or pay what they can this month — "Pay in
 * full, pay next emi in advance or pay custom amount ka option aana chahiye."
 * The money is raised as its own receipt and credited against this plan, so
 * the invoice series and the office's screens keep working unchanged.
 */
export function PayFeesDialog({
  paymentId,
  invoiceNumber,
  outstanding,
  open,
  onOpenChange,
}: {
  paymentId: string;
  invoiceNumber: string;
  outstanding: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [options, setOptions] = useState<Options | null>(null);
  const [choice, setChoice] = useState<Choice>("FULL");
  const [custom, setCustom] = useState("");
  const [paying, setPaying] = useState(false);

  // The dialog is mounted only while it is open, so this runs once per
  // opening and `options` starts null without having to be reset here.
  useEffect(() => {
    if (!open) return;
    let live = true;
    api
      .get<Options>(`/api/student/fees/settle?paymentId=${paymentId}`)
      .then((o) => live && setOptions(o))
      .catch(
        () =>
          live &&
          setOptions({ full: outstanding, next: outstanding, penalty: 0 }),
      );
    return () => {
      live = false;
    };
  }, [open, paymentId, outstanding]);

  const amount =
    choice === "FULL"
      ? (options?.full ?? outstanding)
      : choice === "NEXT"
        ? (options?.next ?? outstanding)
        : Number(custom) || 0;

  async function pay() {
    if (amount <= 0) {
      toast.error("Enter an amount to pay.");
      return;
    }
    setPaying(true);
    try {
      const checkout = await api.post<CheckoutSession>("/api/student/fees/settle", {
        paymentId,
        choice,
        amount: choice === "CUSTOM" ? amount : undefined,
      });
      const ready = await loadRazorpay();
      if (!ready) {
        toast.error("Couldn't load the payment window. Check your connection.");
        setPaying(false);
        return;
      }
      if (!checkout.keyId) {
        toast.error("Online payments aren't set up. Please contact the office.");
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
            toast.success("Payment received. Please keep your receipt.");
          } catch {
            // The webhook reconciles either way, so this is not a failure.
            toast.info("Payment received — your account will update shortly.");
          }
          onOpenChange(false);
          router.refresh();
        },
        modal: { ondismiss: () => setPaying(false) },
      });
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't start the payment.",
      );
      setPaying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="size-4" /> Pay towards {invoiceNumber}
          </DialogTitle>
          <DialogDescription>
            {options?.penalty
              ? `${inr(options.full)} outstanding, including ${inr(options.penalty)} in late fees.`
              : `${inr(options?.full ?? outstanding)} outstanding.`}
          </DialogDescription>
        </DialogHeader>

        {options === null ? (
          <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
            <Loader2 className="size-4 animate-spin" /> Working out what&rsquo;s owed…
          </div>
        ) : (
          <RadioGroup
            value={choice}
            onValueChange={(v) => v && setChoice(v as Choice)}
            className="gap-3"
          >
            <label className="hover:bg-accent/40 flex cursor-pointer items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem value="FULL" className="mt-0.5" />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">
                  Pay in full · {inr(options.full)}
                </span>
                <span className="text-muted-foreground block text-xs">
                  Clears everything owing, late fees included.
                </span>
              </span>
            </label>

            {options.next > 0 && options.next < options.full && (
              <label className="hover:bg-accent/40 flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                <RadioGroupItem value="NEXT" className="mt-0.5" />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">
                    Pay the next instalment · {inr(options.next)}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    Put it in now, ahead of its due date.
                  </span>
                </span>
              </label>
            )}

            <label className="hover:bg-accent/40 flex cursor-pointer items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem value="CUSTOM" className="mt-0.5" />
              <span className="w-full space-y-1.5">
                <span className="block text-sm font-medium">Pay another amount</span>
                <Label className="sr-only" htmlFor="pay-custom">
                  Amount to pay
                </Label>
                <Input
                  id="pay-custom"
                  type="number"
                  min={1}
                  max={options.full}
                  value={custom}
                  onChange={(e) => {
                    setCustom(e.target.value);
                    setChoice("CUSTOM");
                  }}
                  placeholder={`Up to ${options.full}`}
                />
              </span>
            </label>
          </RadioGroup>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={paying}>
            Cancel
          </Button>
          <Button onClick={() => void pay()} disabled={paying || amount <= 0}>
            {paying && <Loader2 className="size-4 animate-spin" />}
            Pay {amount > 0 ? inr(amount) : "now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
