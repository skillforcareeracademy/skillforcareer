import { cache } from "react";
import { prisma } from "@/lib/prisma";
import {
  GA_PATTERN,
  GTM_PATTERN,
  SITE_VERIFICATION_PATTERN,
} from "@/lib/validations/settings";
import { clearMemo, readMemo, writeMemo } from "./memo";

/** The three Google identifiers, as the public site needs them. */
export interface Tracking {
  googleSiteVerification: string;
  gaMeasurementId: string;
  gtmContainerId: string;
}

const NONE: Tracking = {
  googleSiteVerification: "",
  gaMeasurementId: "",
  gtmContainerId: "",
};

/**
 * Read like branding is read — on every request, from the same single `Setting`
 * row, changing only when an admin saves — so it is memoised the same way and
 * dropped explicitly on save. See `branding-service.ts` for the reasoning, and
 * `./memo` for why the store hangs off `globalThis`.
 */
const MEMO_KEY = "tracking";
const TTL_MS = 60_000;

/** Drop the memo so a saved ID is live on the very next page view. */
export function invalidateTracking(): void {
  clearMemo(MEMO_KEY);
}

/**
 * Two of these values are interpolated into an inline `<script>`, so they are
 * re-checked here against the same patterns the settings form validates with.
 * The form is the only way in and only a super admin can reach it, but a value
 * that reaches a script tag should never be trusted to whatever last wrote the
 * row: anything that isn't an ID Google could have issued is dropped.
 */
function clean(stored: Record<string, unknown>, key: keyof Tracking, shape: RegExp): string {
  const value = stored[key];
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return shape.test(trimmed) ? trimmed : "";
}

/**
 * The site's Google connections. Deduped per request — the root layout reads it
 * once for the verification meta tag and again for the script tags.
 *
 * This runs on every page of the public site, so a database hiccup must not
 * take the site down: a failure simply renders the page without tags.
 */
export const getTracking = cache(async (): Promise<Tracking> => {
  const cached = readMemo<Tracking>(MEMO_KEY);
  if (cached) return cached;
  try {
    const row = await prisma.setting.findUnique({ where: { id: "global" } });
    const stored = (row?.data ?? {}) as Record<string, unknown>;
    const value: Tracking = {
      googleSiteVerification: clean(
        stored,
        "googleSiteVerification",
        SITE_VERIFICATION_PATTERN,
      ),
      gaMeasurementId: clean(stored, "gaMeasurementId", GA_PATTERN),
      gtmContainerId: clean(stored, "gtmContainerId", GTM_PATTERN),
    };
    writeMemo(MEMO_KEY, value, TTL_MS);
    return value;
  } catch {
    return NONE; // not memoised — retry on the next request
  }
});
