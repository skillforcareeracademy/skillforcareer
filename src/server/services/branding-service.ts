import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANDING, type Branding } from "@/lib/branding";
import { clearMemo, readMemo, writeMemo } from "./memo";

function pick(stored: Record<string, unknown>, key: keyof Branding): string {
  const value = stored[key];
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : DEFAULT_BRANDING[key];
}

/**
 * Branding is read on *every* request — the root layout wraps the marketing
 * site and the dashboard alike — but it only changes when an admin uploads a
 * logo. Re-reading it per request cost a full database round-trip on every page
 * (~180ms, since the database is not in the app's region), so it is held in
 * process for a short window and dropped explicitly on save.
 *
 * The store is shared across bundles (see `./memo`) — with a module-level
 * variable the settings route cleared its own copy and the pages kept serving
 * the old logo until the TTL ran out.
 */
const MEMO_KEY = "branding";
const TTL_MS = 60_000;

/** Drop the memo so an Admin > Settings > Branding save shows up immediately. */
export function invalidateBranding(): void {
  clearMemo(MEMO_KEY);
}

/**
 * Brand assets from the `Setting` row. Deduped per request as well — the root
 * layout reads it for both the favicon metadata and the branding context.
 *
 * This renders on every page including the public marketing site, so a
 * database hiccup must not blank the header or take the site down: any
 * failure falls back to the bundled defaults.
 */
export const getBranding = cache(async (): Promise<Branding> => {
  const cached = readMemo<Branding>(MEMO_KEY);
  if (cached) return cached;
  try {
    const row = await prisma.setting.findUnique({ where: { id: "global" } });
    const stored = (row?.data ?? {}) as Record<string, unknown>;
    const value: Branding = {
      logoUrl: pick(stored, "logoUrl"),
      faviconUrl: pick(stored, "faviconUrl"),
      siteName: pick(stored, "siteName"),
    };
    writeMemo(MEMO_KEY, value, TTL_MS);
    return value;
  } catch {
    return DEFAULT_BRANDING; // not memoised — retry on the next request
  }
});
