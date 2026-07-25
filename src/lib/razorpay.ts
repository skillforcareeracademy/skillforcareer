import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Minimal Razorpay client — the REST API over `fetch`, no SDK. Keeps the gateway
 * a thin, swappable dependency (the plan's "no vendor lock-in"): orders are
 * created server-side, and both the checkout callback and the webhook are
 * verified with HMAC-SHA256 before we trust a rupee of it.
 *
 * The secret NEVER leaves the server. The browser only ever sees the public
 * key id and the order id.
 */

const API_BASE = "https://api.razorpay.com/v1";

export function razorpayConfigured(): boolean {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

export function razorpayKeyId(): string | null {
  return env.RAZORPAY_KEY_ID ?? null;
}

function authHeader(): string {
  const token = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  return `Basic ${token}`;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string;
}

/**
 * Create a Razorpay order. `amountPaise` is the smallest currency unit (₹1 = 100).
 * Throws on a non-2xx so the caller never hands a half-made order to checkout.
 */
export async function createRazorpayOrder(input: {
  amountPaise: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  if (!razorpayConfigured()) {
    throw new Error("Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).");
  }
  const res = await fetch(`${API_BASE}/orders`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: input.currency ?? "INR",
      receipt: input.receipt,
      notes: input.notes ?? {},
    }),
  });
  const body = (await res.json().catch(() => ({}))) as RazorpayOrder & { error?: { description?: string } };
  if (!res.ok) {
    logger.error("razorpay.order_failed", { status: res.status, error: body?.error?.description });
    throw new Error(body?.error?.description ?? "Could not create the Razorpay order.");
  }
  return body;
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Verify the checkout handler callback. Razorpay signs `order_id|payment_id`
 * with the key secret; a mismatch means the success came from somewhere we
 * didn't issue an order to.
 */
export function verifyCheckoutSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  if (!env.RAZORPAY_KEY_SECRET) return false;
  const expected = createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");
  return safeEqualHex(expected, input.signature);
}

/**
 * Verify a webhook delivery. Razorpay signs the raw request body with the
 * webhook secret (set in the Razorpay dashboard, mirrored in
 * RAZORPAY_WEBHOOK_SECRET). Always verify against the raw bytes — re-serialising
 * parsed JSON would change the signature.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;
  const expected = createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return safeEqualHex(expected, signature);
}
