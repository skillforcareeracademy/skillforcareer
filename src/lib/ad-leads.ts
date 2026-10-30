import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Ad-platform lead capture — the plumbing that turns a Facebook/Instagram or
 * Google ad lead into a row in the academy's own CRM, so the sales team never
 * has to leave the panel.
 *
 * Everything here is inert until the matching env vars are set, so an
 * unconfigured deployment simply rejects the webhooks rather than failing.
 */

/** Whether Meta (Facebook/Instagram) Lead Ads capture is switched on. */
export function metaConfigured(): boolean {
  return Boolean(env.META_APP_SECRET && env.META_PAGE_ACCESS_TOKEN);
}

/** Whether Google Ads Lead Form capture is switched on. */
export function googleConfigured(): boolean {
  return Boolean(env.GOOGLE_LEADS_KEY);
}

/**
 * Verify Meta's `X-Hub-Signature-256` over the RAW request body. Trust comes
 * entirely from this HMAC — the endpoint is public — so a bad or missing
 * signature is rejected before anything is parsed.
 */
export function verifyMetaSignature(rawBody: string, header: string | null): boolean {
  if (!env.META_APP_SECRET || !header) return false;
  const expected =
    "sha256=" + createHmac("sha256", env.META_APP_SECRET).update(rawBody).digest("hex");
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
 * token is required for the integration to be "configured".
 */
export async function fetchMetaLead(leadgenId: string): Promise<MetaLeadData | null> {
  if (!metaConfigured()) return null;
  const v = env.META_GRAPH_VERSION;
  const url =
    `https://graph.facebook.com/${v}/${encodeURIComponent(leadgenId)}` +
    `?fields=field_data,campaign_name,ad_name,form_id` +
    `&access_token=${encodeURIComponent(env.META_PAGE_ACCESS_TOKEN ?? "")}`;
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
export function googleKeyMatches(key: unknown): boolean {
  if (!env.GOOGLE_LEADS_KEY || typeof key !== "string") return false;
  const a = Buffer.from(key);
  const b = Buffer.from(env.GOOGLE_LEADS_KEY);
  return a.length === b.length && timingSafeEqual(a, b);
}
