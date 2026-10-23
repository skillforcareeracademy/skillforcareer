"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import { CourseSearch } from "@/components/shared/course-search";
import { cn } from "@/lib/utils";

/**
 * The header's search as an icon that opens a full-screen overlay — a dimmed,
 * blurred backdrop with the search box floated near the top and its live
 * suggestions beneath. On a crowded header the inline box used to shrink to an
 * unusable sliver ("search click karu to sahi se work nahi kar raha"); the
 * overlay has all the room it needs and reads the same at every width.
 *
 * Rendered through a portal on `document.body`: the header's own backdrop-blur
 * makes it a containing block for `position: fixed`, so an overlay left inside
 * the header would anchor to the header rather than the viewport.
 */
export function HeaderSearch({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMounted(true), []);

  // A picked suggestion navigates; close the overlay once the page changes.
  // Deferred a tick — the compiler rejects a synchronous setState in an effect.
  useEffect(() => {
    const id = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(id);
  }, [pathname]);

  // Escape closes it, and the page behind it doesn't scroll while it's up.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search courses"
        className="border-input bg-muted/50 text-muted-foreground hover:text-foreground hover:border-primary/40 flex size-9 items-center justify-center rounded-full border transition-colors"
      >
        <Search className="size-4" />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 px-4 pt-[14vh] backdrop-blur-sm"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Search courses"
          >
            <div
              className="w-full max-w-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-white/90">
                  Search courses &amp; skills
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close search"
                  className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
                >
                  <X className="size-5" />
                </button>
              </div>

              {/* `autoFocus` focuses the box and drops its suggestion list open. */}
              <CourseSearch autoFocus variant="hero" />

              <p className="mt-3 text-center text-xs text-white/60">
                Press Esc to close
              </p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
