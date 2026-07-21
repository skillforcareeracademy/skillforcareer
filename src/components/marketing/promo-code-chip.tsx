"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * The coupon code in the announcement bar, as a click-to-copy chip — a code you
 * have to retype by hand is a code that gets typed wrong at checkout.
 */
export function PromoCodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard
          ?.writeText(code)
          .then(() => setCopied(true))
          .catch(() => setCopied(false));
      }}
      aria-label={`Copy coupon code ${code}`}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/40 bg-white/15 px-2.5 py-0.5 font-mono text-[0.7rem] font-semibold tracking-wide transition-colors hover:bg-white/25 sm:text-xs"
    >
      {code}
      {copied ? (
        <Check className="size-3" aria-hidden />
      ) : (
        <Copy className="size-3 opacity-80" aria-hidden />
      )}
      <span className="sr-only">{copied ? "Copied" : ""}</span>
    </button>
  );
}
