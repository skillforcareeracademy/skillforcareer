import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANDING, type Branding } from "@/lib/branding";

function pick(stored: Record<string, unknown>, key: keyof Branding): string {
  const value = stored[key];
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : DEFAULT_BRANDING[key];
}

/**
 * Brand assets from the `Setting` row, so an upload in Admin > Settings >
 * Branding takes effect on the next request. Deduped per request — the root
 * layout reads it for both the favicon metadata and the branding context.
 *
 * This renders on every page including the public marketing site, so a
 * database hiccup must not blank the header or take the site down: any
 * failure falls back to the bundled defaults.
 */
export const getBranding = cache(async (): Promise<Branding> => {
  try {
    const row = await prisma.setting.findUnique({ where: { id: "global" } });
    const stored = (row?.data ?? {}) as Record<string, unknown>;
    return {
      logoUrl: pick(stored, "logoUrl"),
      faviconUrl: pick(stored, "faviconUrl"),
      siteName: pick(stored, "siteName"),
    };
  } catch {
    return DEFAULT_BRANDING;
  }
});
