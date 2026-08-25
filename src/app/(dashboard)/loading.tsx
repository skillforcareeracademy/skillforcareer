import { Loader2 } from "lucide-react";

/** Dashboard page fallback — the sidebar and header stay while this shows. */
export default function DashboardLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="text-primary size-6 animate-spin" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
