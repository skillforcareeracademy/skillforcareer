"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { CourseSearch } from "@/components/shared/course-search";
import { cn } from "@/lib/utils";

/**
 * The header's search as an icon that opens a panel, rather than a box wedged
 * into the row. On a crowded header the inline box used to shrink until only
 * its magnifying glass was left, and clicking that focused an input a pixel
 * wide — "search click karu to sahi se work nahi kar raha". A button that opens
 * a proper, focused search with live suggestions works the same at every width.
 */
export function HeaderSearch({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Search courses"
        aria-expanded={open}
        className="border-input bg-muted/50 text-muted-foreground hover:text-foreground hover:border-primary/40 flex size-9 items-center justify-center rounded-full border transition-colors"
      >
        {open ? <X className="size-4" /> : <Search className="size-4" />}
      </button>

      {open && (
        <div className="absolute top-full right-0 z-50 mt-2 w-[min(92vw,26rem)]">
          {/* `autoFocus` focuses the box and drops its suggestion list open. */}
          <CourseSearch autoFocus />
        </div>
      )}
    </div>
  );
}
