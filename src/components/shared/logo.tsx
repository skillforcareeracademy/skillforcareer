"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useBranding } from "@/components/providers/branding-provider";

interface LogoProps {
  href?: string;
  /** Show the site name beside the mark. Off by default — the client's logo is
   *  a full lockup that already contains the wordmark. */
  showText?: boolean;
  className?: string;
}

/**
 * Brand mark — whatever is set in Admin > Settings > Branding, falling back to
 * the bundled default. Reused in headers, auth pages and the live room.
 */
export function Logo({ href = "/", showText = false, className }: LogoProps) {
  const { logoUrl, siteName } = useBranding();

  {
    /* Deliberately not next/image: the logo is replaceable at runtime, so its
       intrinsic dimensions aren't known at build time and it may be served
       from /api/files after an upload.

       It also ships with a baked-in white background (no alpha) and its inner
       swoosh is white too — keying the white out would punch a hole through
       the mark, so on dark surfaces it sits on a light chip instead. */
  }
  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt={siteName}
      // cn() merges through tailwind-merge, so a caller passing `h-14` wins.
      className={cn(
        "h-[42px] w-auto max-w-[220px] object-contain dark:rounded-md dark:bg-white dark:p-1",
        className,
      )}
    />
  );

  const content = showText ? (
    <span className="flex items-center gap-2.5">
      {image}
      <span className="text-base font-semibold tracking-tight">{siteName}</span>
    </span>
  ) : (
    image
  );

  if (!href) return content;

  return (
    <Link href={href} aria-label={siteName} className="inline-flex">
      {content}
    </Link>
  );
}
