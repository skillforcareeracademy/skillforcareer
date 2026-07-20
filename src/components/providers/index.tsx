"use client";

import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DEFAULT_BRANDING, type Branding } from "@/lib/branding";
import { BrandingProvider } from "./branding-provider";
import { ThemeProvider } from "./theme-provider";

/**
 * Single client boundary composing all global providers. Mounted once in the
 * root layout so Server Components stay server-rendered above it.
 */
export function AppProviders({
  children,
  branding = DEFAULT_BRANDING,
}: {
  children: ReactNode;
  branding?: Branding;
}) {
  return (
    <ThemeProvider>
      <BrandingProvider value={branding}>
        <TooltipProvider delay={200}>
          {children}
          <Toaster richColors position="top-right" closeButton />
        </TooltipProvider>
      </BrandingProvider>
    </ThemeProvider>
  );
}
