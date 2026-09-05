/**
 * Browser-side Razorpay checkout — the widget half of the payment flow.
 *
 * Extracted because three screens now open the same window: the course buy box,
 * the counsellor's shareable pay link, and the express checkout a visitor lands
 * on from "Enroll Now". The server halves stay where they are; this is only the
 * script tag and the option shape.
 */

export interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (resp: RazorpayResponse) => void;
  modal?: { ondismiss?: () => void };
}

type RazorpayCtor = new (options: RazorpayOptions) => { open: () => void };

/** What `POST /api/payments/checkout` (and the pay-link twin) hands back. */
export interface CheckoutSession {
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  keyId: string | null;
  courseTitle?: string;
  prefill: { name: string; email: string };
}

/** Inject Razorpay's script once. Resolves false when it can't be reached. */
export function loadRazorpay(): Promise<boolean> {
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

/** Open the checkout window for a session. The caller owns success/failure. */
export function openRazorpay(options: RazorpayOptions): void {
  const Razorpay = (window as unknown as { Razorpay: RazorpayCtor }).Razorpay;
  new Razorpay(options).open();
}
