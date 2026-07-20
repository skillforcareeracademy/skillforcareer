import { Loader2 } from "lucide-react";

/** Route-level loading fallback for Suspense during navigation. */
export default function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Loader2 className="text-muted-foreground size-6 animate-spin" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
