"use client";

import { useState } from "react";
import { UserCog, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

/**
 * Persistent banner shown while an admin is "secretly logged in" as another
 * user. Clicking "Return to your account" hits the stop endpoint (which trusts
 * the signed impersonation cookie) and reloads into the admin's dashboard.
 */
export function ImpersonationBanner({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  const [loading, setLoading] = useState(false);

  async function stop() {
    setLoading(true);
    try {
      const res = await api.post<{ redirect?: string }>(
        "/api/impersonate/stop",
        {},
      );
      window.location.href = res.redirect ?? "/admin";
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Couldn't return to your account.",
      );
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200">
      <span className="flex items-center gap-1.5">
        <UserCog className="size-4 shrink-0" />
        Viewing as <span className="font-semibold">{name}</span>
        <span className="hidden sm:inline">({email})</span>
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={stop}
        disabled={loading}
        className="h-7 border-amber-400 bg-white/70 text-amber-900 hover:bg-white dark:border-amber-500/40 dark:bg-transparent dark:text-amber-100"
      >
        {loading && <Loader2 className="size-3.5 animate-spin" />}
        Return to your account
      </Button>
    </div>
  );
}
