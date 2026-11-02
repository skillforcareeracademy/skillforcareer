import { createHmac, timingSafeEqual } from "node:crypto";
import type { MetaConfig } from "@/server/services/ad-config-service";

/**
 * Ad-platform lead capture — the plumbing that turns a Facebook/Instagram or
 * Google ad lead into a row in the academy's own CRM, so the sales team never
 * has to leave the panel.
 *
 * These are the pure crypto/fetch helpers; the credentials themselves come from
 * {@link import("@/server/services/ad-config-service")} (the panel's connect
 * form, with env as a fallback), so everything here takes the resolved value as
 * an argument rather than reading it directly.
 */

/**
 * Verify Meta's `X-Hub-Signature-256` over the RAW request body. Trust comes
 * entirely from this HMAC — the endpoint is public — so a bad or missing
 * signature (or an unset secret) is rejected before anything is parsed.
 */
export function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  if (!appSecret || !header) return false;
  const expected =
    "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The fields a lead form collected, plus the campaign it came from. */
export interface MetaLeadData {
  fields: Record<string, string>;
  campaign: string | null;
  formId: string | null;
  adName: string | null;
}

/**
 * Fetch one lead's answers from the Graph API. Meta's webhook only carries the
 * lead's id; the answers are read back with the page token, which is why the
 * token is required for the integration to be "ready".
 */
export async function fetchMetaLead(
  leadgenId: string,
  cfg: MetaConfig,
): Promise<MetaLeadData | null> {
  if (!cfg.pageToken) return null;
  const url =
    `https://graph.facebook.com/${cfg.graphVersion}/${encodeURIComponent(leadgenId)}` +
    `?fields=field_data,campaign_name,ad_name,form_id` +
    `&access_token=${encodeURIComponent(cfg.pageToken)}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      field_data?: { name?: string; values?: string[] }[];
      campaign_name?: string;
      ad_name?: string;
      form_id?: string;
    };
    const fields: Record<string, string> = {};
    for (const f of data.field_data ?? []) {
      const key = String(f.name ?? "").toLowerCase().trim();
      if (key) fields[key] = Array.isArray(f.values) ? String(f.values[0] ?? "") : "";
    }
    return {
      fields,
      campaign: data.campaign_name ?? null,
      formId: data.form_id ?? null,
      adName: data.ad_name ?? null,
    };
  } catch {
    return null;
  }
}

/** Constant-time equality for the Google lead-form shared key. */
export function googleKeyMatches(key: unknown, configured: string): boolean {
  if (!configured || typeof key !== "string") return false;
  const a = Buffer.from(key);
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}
