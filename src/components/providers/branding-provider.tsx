"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_BRANDING, type Branding } from "@/lib/branding";

const BrandingContext = createContext<Branding>(DEFAULT_BRANDING);

/**
 * Carries the admin-configured brand assets down to `<Logo />`, which is
 * rendered from both Server Components (headers, footer) and Client
 * Components (the live room) — context is what reaches both.
 */
export function BrandingProvider({
  value,
  children,
}: {
  value: Branding;
  children: ReactNode;
}) {
  return <BrandingContext value={value}>{children}</BrandingContext>;
}

export function useBranding(): Branding {
  return useContext(BrandingContext);
}
