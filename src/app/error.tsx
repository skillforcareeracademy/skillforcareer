"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";

/** Root error boundary. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side error reporting hook (wire to Sentry/etc. later).
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <ErrorState
        title="Unexpected error"
        description="An unexpected error occurred while rendering this page."
        onRetry={reset}
        className="max-w-md"
      />
    </div>
  );
}
