import type { Metadata } from "next";
import Link from "next/link";
import {
  Rocket,
  Megaphone,
  Search,
  CheckCircle2,
  CircleDashed,
  Webhook,
  ArrowRight,
  Info,
} from "lucide-react";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { metaConfigured, googleConfigured } from "@/lib/ad-leads";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Ads" };
export const dynamic = "force-dynamic";

/**
 * Ads — the hub for the academy's paid acquisition. Phase one is **lead
 * capture**: Facebook/Instagram and Google ad leads flow straight into the Lead
 * CRM, so the sales team never leaves the panel. Campaign management comes next.
 */
export default async function AdIntegrationsPage() {
  await requirePermission(PERMISSIONS.MANAGE_LEADS);

  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const [metaLeads, googleLeads] = await Promise.all([
    prisma.lead.count({ where: { source: "META_ADS" } }),
    prisma.lead.count({ where: { source: "GOOGLE_ADS" } }),
  ]);

  const integrations = [
    {
      key: "meta",
      name: "Facebook / Instagram Ads",
      icon: Megaphone,
      connected: metaConfigured(),
      leads: metaLeads,
      source: "META_ADS",
      webhook: `${base}/api/webhooks/meta/leads`,
      tint: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
      steps: [
        "Create a Meta App (developers.facebook.com, type “Business”) and add the Webhooks + Lead Ads products.",
        "Request leads_retrieval, pages_manage_ads, pages_read_engagement, pages_show_list and submit for App Review.",
        "Subscribe the Page to the leadgen webhook with the URL below and your Verify Token.",
        "Send your App ID, App Secret, Page ID and a long-lived Page Access Token — these go in the server config and the connection turns green.",
      ],
    },
    {
      key: "google",
      name: "Google Ads",
      icon: Search,
      connected: googleConfigured(),
      leads: googleLeads,
      source: "GOOGLE_ADS",
      webhook: `${base}/api/webhooks/google/leads`,
      tint: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
      steps: [
        "Open your Lead Form asset in Google Ads and go to its Webhook integration.",
        "Paste the Webhook URL below and set a Key (any secret string).",
        "Send me that Key — it goes in the server config and the connection turns green.",
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ads"
        description="Run your ads and bring every lead straight into the panel — no more switching to Facebook or Google to see who enquired."
      />

      <Card className="flex items-start gap-3 border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
        <Info className="mt-0.5 size-5 shrink-0 text-sky-600 dark:text-sky-400" />
        <div className="text-sm">
          <p className="font-medium">Phase 1 — lead capture</p>
          <p className="text-muted-foreground mt-0.5">
            Connect the platforms below and every ad lead lands in{" "}
            <Link href="/admin/leads" className="text-primary hover:underline">
              Leads
            </Link>{" "}
            automatically, tagged by platform and campaign, ready for your sales
            team. Spend / cost-per-lead reporting and creating campaigns from the
            panel come next.
          </p>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {integrations.map((it) => (
          <Card key={it.key} className="flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={`grid size-10 place-items-center rounded-xl ${it.tint}`}>
                  <it.icon className="size-5" />
                </span>
                <div>
                  <h2 className="font-semibold">{it.name}</h2>
                  <p className="text-muted-foreground text-xs">
                    {it.leads} lead{it.leads === 1 ? "" : "s"} captured
                  </p>
                </div>
              </div>
              {it.connected ? (
                <Badge className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  <CheckCircle2 className="size-3.5" /> Connected
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <CircleDashed className="size-3.5" /> Not connected
                </Badge>
              )}
            </div>

            <div className="space-y-1.5">
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                <Webhook className="size-3.5" /> Webhook URL
              </p>
              <code className="bg-muted block overflow-x-auto rounded-md px-3 py-2 text-xs select-all">
                {it.webhook}
              </code>
            </div>

            <div className="space-y-1.5">
              <p className="text-muted-foreground text-xs font-medium">Setup</p>
              <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-xs">
                {it.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </div>

            {it.leads > 0 && (
              <Link
                href={`/admin/leads?source=${it.source}`}
                className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
              >
                View these leads <ArrowRight className="size-4" />
              </Link>
            )}
          </Card>
        ))}
      </div>

      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Rocket className="size-3.5" />
        Leads are de-duplicated on the platform&rsquo;s own lead id, so a retried
        delivery never creates the same person twice.
      </p>
    </div>
  );
}
