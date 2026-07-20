"use client";

import { useState } from "react";
import { Loader2, Tag, Check, X } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Website coupon-apply on a course — validates a code and previews the price. */
export function CouponApply({ courseId, price }: { courseId: string; price: number }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ discount: number; net: number; code: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.post<{ valid: boolean; reason?: string; discount?: number; netAmount?: number; code?: string }>(
        "/api/coupons/validate",
        { code, amount: price, courseId },
      );
      if (!r.valid) {
        setResult(null);
        setError(r.reason ?? "Invalid coupon code.");
      } else {
        setResult({ discount: r.discount ?? 0, net: r.netAmount ?? price, code: r.code ?? code.toUpperCase() });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't check that code.");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-50 p-3 text-sm dark:bg-emerald-500/10">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-300">
            <Check className="size-4" /> {result.code} applied
          </span>
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setCode("");
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Remove coupon"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1.5 flex items-baseline gap-2">
          <span className="text-lg font-bold">₹{result.net.toLocaleString("en-IN")}</span>
          <span className="text-muted-foreground text-xs">
            (₹{result.discount.toLocaleString("en-IN")} off — pay this on checkout)
          </span>
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-primary flex items-center gap-1.5 text-sm font-medium hover:underline"
      >
        <Tag className="size-4" /> Have a coupon code?
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError(null);
          }}
          placeholder="Enter coupon code"
          className="font-mono"
          onKeyDown={(e) => e.key === "Enter" && apply()}
        />
        <Button type="button" variant="outline" onClick={apply} disabled={loading || !code.trim()}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : "Apply"}
        </Button>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
