"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useBranding } from "@/components/providers/branding-provider";
import { imageProps } from "@/lib/image-sizes";

interface LogoProps {
  href?: string;
  /** Show the site name beside the mark. Off by default — the client's logo is
   *  a full lockup that already contains the wordmark. */
  showText?: boolean;
  /**
   * Rendering on a dark surface (the live class room). Uses the dark-surface
   * mark from Admin → Settings → Branding when one has been uploaded — a logo
   * drawn in dark ink disappears on black, and the academy's answer to that is
   * its own light version.
   */
  onDark?: boolean;
  className?: string;
}

/**
 * Brand mark — whatever is set in Admin > Settings > Branding, falling back to
 * the bundled default. Reused in headers, auth pages and the live room.
 */
export function Logo({ href = "/", showText = false, onDark = false, className }: LogoProps) {
  const { logoUrl, logoDarkUrl, siteName } = useBranding();
  const src = onDark && logoDarkUrl ? logoDarkUrl : logoUrl;

  {
    /* Deliberately not next/image: the logo is replaceable at runtime, so its
       intrinsic dimensions aren't known at build time and it may be served
       from /api/files after an upload.

       The bundled mark now carries a real alpha channel — the white paper it
       was exported on has been flood-filled away from the edges, so it sits on
       whatever is behind it. No light chip on dark surfaces any more: that only
       ever existed to hide the white rectangle, and it read as a white box
       around the logo. */
  }
  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...imageProps(src, 256)}
      alt={siteName}
      // cn() merges through tailwind-merge, so a caller passing `h-14` wins.
      className={cn(
        "h-[42px] w-auto max-w-[220px] object-contain",
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
