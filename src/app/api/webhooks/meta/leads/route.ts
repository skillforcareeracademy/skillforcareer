import { logger } from "@/lib/logger";
import { verifyMetaSignature } from "@/lib/ad-leads";
import { getMetaConfig, metaReady } from "@/server/services/ad-config-service";
import { ingestMetaLead } from "@/server/services/ad-lead-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta (Facebook/Instagram) Lead Ads webhook.
 *
 * GET  — the one-time subscription handshake: Meta calls with a verify token and
 *        a challenge, and expects the challenge echoed back verbatim.
 * POST — a `leadgen` event. Public, so trust is the HMAC signature over the raw
 *        body; each lead's answers are then read back from the Graph API and
 *        filed in the CRM. Always answers 200 so Meta stops retrying — the
 *        dedup on the platform lead id makes a retry harmless.
 */
export async function GET(req: Request): Promise<Response> {
  const sp = new URL(req.url).searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge") ?? "";
  const { verifyToken } = await getMetaConfig();
  if (mode === "subscribe" && verifyToken && token === verifyToken) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  const cfg = await getMetaConfig();
  if (!metaReady(cfg)) return new Response("Not configured", { status: 503 });
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), cfg.appSecret)) {
    logger.warn("ad_lead.meta_bad_signature");
    return new Response("Bad signature", { status: 401 });
  }

  let body: {
    entry?: { changes?: { field?: string; value?: { leadgen_id?: string } }[] }[];
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const ids: string[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === "leadgen" && change.value?.leadgen_id) {
        ids.push(String(change.value.leadgen_id));
      }
    }
  }

  for (const id of ids) {
    try {
      await ingestMetaLead(id);
    } catch (e) {
      logger.error("ad_lead.meta_ingest_error", { id, error: String(e) });
    }
  }
  return new Response("OK", { status: 200 });
}
