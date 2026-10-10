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

  /**
   * On a dark surface with no light version uploaded, the mark sits on a
   * white card.
   *
   * The mark carries a real alpha channel, so it has no white rectangle to
   * hide any more — but transparency was never the problem on black. Its
   * wordmark is drawn in dark ink, and on the live class background "CAREER"
   * all but disappeared. A light version uploaded under Settings → Branding
   * is still preferred and used bare; this is what happens until there is
   * one, and it is what every product does with an ink logo on a dark header.
   */
  const needsCard = onDark && !logoDarkUrl;

  {
    /* Deliberately not next/image: the logo is replaceable at runtime, so its
       intrinsic dimensions aren't known at build time and it may be served
       from /api/files after an upload. */
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

  const framed = needsCard ? (
    <span className="inline-flex items-center rounded-xl bg-white px-3 py-2 shadow-sm">
      {image}
    </span>
  ) : (
    image
  );

  const content = showText ? (
    <span className="flex items-center gap-2.5">
      {framed}
      <span
        className={cn(
          "text-base font-semibold tracking-tight",
          onDark && "text-white",
        )}
      >
        {siteName}
      </span>
    </span>
  ) : (
    framed
  );

  if (!href) return content;

  return (
    <Link href={href} aria-label={siteName} className="inline-flex">
      {content}
    </Link>
  );
}
