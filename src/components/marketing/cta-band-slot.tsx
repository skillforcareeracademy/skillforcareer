"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Pages that end on a call to action of their own.
 *
 * The marketing layout adds the site-wide closing banner to every public page,
 * which is right almost everywhere — but For business already closed with its
 * own "request a proposal" banner, so visitors met two pink gradient bands back
 * to back. That is the "do CTA ek sath hain" the client reported. The page's own
 * banner wins there: it asks for the thing that page exists to get.
 */
const OWN_CTA = ["/for-business"];

export function CtaBandSlot({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (OWN_CTA.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return null;
  }
  return <>{children}</>;
}
