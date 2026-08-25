import { Loader2 } from "lucide-react";

/**
 * Shown inside the marketing shell while a page loads, so the header, footer
 * and announcement bar stay put instead of the whole window blanking.
 */
export default function MarketingLoading() {
  return (
    <div className="container-page flex min-h-[60vh] items-center justify-center py-24">
      <Loader2 className="text-primary size-7 animate-spin" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
