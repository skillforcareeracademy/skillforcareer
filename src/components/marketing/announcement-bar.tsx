import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";

/** Top promo strip. */
export function AnnouncementBar() {
  return (
    <div className="bg-gradient-to-r from-rose-600 via-pink-600 to-fuchsia-600 text-white">
      <Link
        href="/register"
        className="container-page flex items-center justify-center gap-2 py-2 text-center text-xs font-medium sm:text-sm"
      >
        <Sparkles className="size-3.5 shrink-0" />
        <span>
          New year, new skills — up to <strong>40% off</strong> on career
          programs.
        </span>
        <span className="hidden items-center gap-1 underline underline-offset-2 sm:inline-flex">
          Explore <ArrowRight className="size-3.5" />
        </span>
      </Link>
    </div>
  );
}
