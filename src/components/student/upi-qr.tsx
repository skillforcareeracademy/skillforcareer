"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * A UPI "scan to pay" QR, built on the device from the account's UPI id. Shown
 * for an EMI whose account the office settles by hand (not the auto-reconciling
 * Razorpay one) — the learner pays and tells the office, who marks it received.
 */
export function UpiQr({
  upi,
  name,
  amount,
}: {
  upi: string;
  name: string;
  amount?: number;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ pa: upi, pn: name, cu: "INR" });
    if (amount && amount > 0) params.set("am", String(amount));
    QRCode.toDataURL(`upi://pay?${params.toString()}`, { margin: 1, width: 180 })
      .then((d) => alive && setSrc(d))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [upi, name, amount]);

  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`UPI QR to pay ${name}`}
      width={160}
      height={160}
      className="rounded-md border bg-white p-1"
    />
  );
}
