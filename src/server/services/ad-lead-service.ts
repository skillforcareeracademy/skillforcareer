import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { fetchMetaLead } from "@/lib/ad-leads";
import { createLead } from "./lead-service";

/**
 * Ad leads → the CRM.
 *
 * A Facebook/Instagram or Google ad lead becomes an ordinary lead in the
 * academy's own pipeline — same stages, same counsellors — tagged with the
 * platform it came from and the campaign, so the sales team works it entirely
 * in the panel. Each platform's own lead id is stored so a retried webhook
 * can't create the same person twice.
 */

/** Ad-lead performance for the Ads dashboard — all from the CRM, no ad-platform
 *  API needed (that comes with spend/cost-per-lead later). */
export interface AdLeadStats {
  total: number;
  thisMonth: number;
  byPlatform: { meta: number; google: number };
  converted: number;
  conversionPct: number;
  topCampaigns: { campaign: string; leads: number; converted: number }[];
  /** Eight most recent weeks, oldest first. */
  weeks: { label: string; meta: number; google: number }[];
}

export async function adLeadStats(): Promise<AdLeadStats> {
  const leads = await prisma.lead.findMany({
    where: { source: { in: ["META_ADS", "GOOGLE_ADS"] } },
    select: { source: true, campaign: true, createdAt: true, stage: true },
  });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const isConverted = (s: string | null) => s === "CONVERTED";

  const total = leads.length;
  const thisMonth = leads.filter((l) => l.createdAt >= monthStart).length;
  const meta = leads.filter((l) => l.source === "META_ADS").length;
  const google = leads.filter((l) => l.source === "GOOGLE_ADS").length;
  const converted = leads.filter((l) => isConverted(l.stage)).length;

  const byCamp = new Map<string, { leads: number; converted: number }>();
  for (const l of leads) {
    const key = l.campaign?.trim() || "No campaign";
    const e = byCamp.get(key) ?? { leads: 0, converted: 0 };
    e.leads += 1;
    if (isConverted(l.stage)) e.converted += 1;
    byCamp.set(key, e);
  }
  const topCampaigns = [...byCamp.entries()]
    .map(([campaign, v]) => ({ campaign, ...v }))
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 8);

  // Eight weekly buckets, Monday-aligned, oldest first.
  const msWeek = 7 * 24 * 60 * 60 * 1000;
  const thisWeek = new Date(now);
  thisWeek.setHours(0, 0, 0, 0);
  thisWeek.setDate(thisWeek.getDate() - ((thisWeek.getDay() + 6) % 7));
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(thisWeek.getTime() - (7 - i) * msWeek);
    const end = new Date(start.getTime() + msWeek);
    const inWeek = leads.filter((l) => l.createdAt >= start && l.createdAt < end);
    return {
      label: start.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      meta: inWeek.filter((l) => l.source === "META_ADS").length,
      google: inWeek.filter((l) => l.source === "GOOGLE_ADS").length,
    };
  });

  return {
    total,
    thisMonth,
    byPlatform: { meta, google },
    converted,
    conversionPct: total > 0 ? Math.round((converted / total) * 100) : 0,
    topCampaigns,
    weeks,
  };
}

interface MappedLead {
  name: string;
  phone: string;
  email: string;
  courseInterest?: string;
  campaign: string | null;
  /** `meta:<leadgenId>` or `google:<leadId>` — unique per platform lead. */
  externalId: string;
}

async function saveAdLead(
  m: MappedLead,
  source: "META_ADS" | "GOOGLE_ADS",
): Promise<string | null> {
  const phone = m.phone.replace(/[^\d+]/g, "");
  if (phone.length < 6) {
    // A lead with no usable phone can't be worked by the sales team; log it so
    // the academy can add Phone as a required field on the ad form.
    logger.warn("ad_lead.no_phone", { source, externalId: m.externalId });
    return null;
  }
  // A webhook is delivered at least once and often retried — never a duplicate.
  const existing = await prisma.lead.findFirst({
    where: { externalId: m.externalId },
    select: { id: true },
  });
  if (existing) return existing.id;

  const id = await createLead(
    {
      name: m.name,
      phone,
      email: m.email,
      courseInterest: m.courseInterest,
      message: `Lead from ${source === "META_ADS" ? "Facebook/Instagram" : "Google"} Ads${m.campaign ? ` — ${m.campaign}` : ""}`,
    },
    source,
  );
  // The enquiry shape carries no attribution, so stamp it on afterwards.
  await prisma.lead.updateMany({
    where: { id },
    data: { campaign: m.campaign, externalId: m.externalId },
  });
  logger.info("ad_lead.created", { id, source, campaign: m.campaign });
  return id;
}

/** Pull one Meta lead's answers and file it in the CRM. */
export async function ingestMetaLead(leadgenId: string): Promise<void> {
  const data = await fetchMetaLead(leadgenId);
  if (!data) {
    logger.warn("ad_lead.meta_fetch_failed", { leadgenId });
    return;
  }
  const f = data.fields;
  const name =
    f["full_name"] ||
    [f["first_name"], f["last_name"]].filter(Boolean).join(" ") ||
    "Facebook lead";
  const phone = f["phone_number"] || f["phone"] || "";
  const email = f["email"] || "";
  const courseInterest =
    f["course"] || f["which_course"] || f["course_interest"] || undefined;
  await saveAdLead(
    { name, phone, email, courseInterest, campaign: data.campaign, externalId: `meta:${leadgenId}` },
    "META_ADS",
  );
}

/** A column as Google posts it in a lead-form webhook. */
interface GoogleColumn {
  column_id?: string;
  column_name?: string;
  string_value?: string;
}

/** Map a Google Lead Form webhook body and file it in the CRM. */
export async function ingestGoogleLead(
  payload: Record<string, unknown>,
): Promise<void> {
  const cols = Array.isArray(payload.user_column_data)
    ? (payload.user_column_data as GoogleColumn[])
    : [];
  const pick = (...needles: string[]): string => {
    for (const c of cols) {
      const key = String(c.column_id ?? c.column_name ?? "").toLowerCase();
      if (needles.some((n) => key.includes(n))) return String(c.string_value ?? "");
    }
    return "";
  };
  const name =
    pick("full_name", "name") ||
    [pick("first_name"), pick("last_name")].filter(Boolean).join(" ") ||
    "Google lead";
  const phone = pick("phone");
  const email = pick("email");
  const courseInterest = pick("course", "interest") || undefined;
  const leadId = String(payload.lead_id ?? payload.leadId ?? "");
  const campaign = payload.campaign_id ? String(payload.campaign_id) : null;
  await saveAdLead(
    {
      name,
      phone,
      email,
      courseInterest,
      campaign,
      externalId: `google:${leadId || email || Date.now()}`,
    },
    "GOOGLE_ADS",
  );
}
