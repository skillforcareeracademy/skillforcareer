import { logger } from "@/lib/logger";
import { googleConfigured, googleKeyMatches } from "@/lib/ad-leads";
import { ingestGoogleLead } from "@/server/services/ad-lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Google Ads Lead Form webhook.
 *
 * Google posts the lead's answers with a `google_key` that must match the
 * shared key configured on the form; that is the whole of the trust. A setup
 * test ping (`is_test`) is acknowledged without creating a lead.
 */
export async function POST(req: Request): Promise<Response> {
  if (!googleConfigured()) return new Response("Not configured", { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  if (!googleKeyMatches(body.google_key)) {
    logger.warn("ad_lead.google_bad_key");
    return new Response("Forbidden", { status: 403 });
  }

  // Google validates the endpoint with a test payload — acknowledge, don't file.
  if (body.is_test === true) return new Response("OK", { status: 200 });

  try {
    await ingestGoogleLead(body);
  } catch (e) {
    logger.error("ad_lead.google_ingest_error", { error: String(e) });
  }
  return new Response("OK", { status: 200 });
}
