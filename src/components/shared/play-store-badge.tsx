import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A "Get it on Google Play" badge — the dark, two-line button in the shape the
 * store badge uses. Opens the Play listing in a new tab. Shared by the footer
 * and anywhere else a compact download button is wanted.
 */
export function PlayStoreBadge({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Get the Android app on Google Play"
      className={cn(
        "inline-flex items-center gap-2.5 rounded-xl bg-neutral-900 px-4 py-2 text-white shadow-sm transition hover:bg-neutral-800",
        className,
      )}
    >
      <Play className="size-6 shrink-0" fill="currentColor" aria-hidden />
      <span className="flex flex-col text-left leading-tight">
        <span className="text-[9px] tracking-wide text-white/80 uppercase">
          Get it on
        </span>
        <span className="text-base font-semibold">Google Play</span>
      </span>
    </a>
  );
}
