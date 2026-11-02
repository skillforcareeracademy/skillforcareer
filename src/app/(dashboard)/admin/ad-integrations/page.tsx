import type { Metadata } from "next";
import Link from "next/link";
import {
  Rocket,
  Megaphone,
  Search,
  Info,
  Users,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import { env } from "@/lib/env";
import { adConfigStatus } from "@/server/services/ad-config-service";
import { adLeadStats } from "@/server/services/ad-lead-service";
import { AdConnectForm } from "@/components/admin/ads/ad-connect-form";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Ads" };
export const dynamic = "force-dynamic";

/**
 * Ads — the hub for the academy's paid acquisition. Phase one is **lead
 * capture**: Facebook/Instagram and Google ad leads flow straight into the Lead
 * CRM, so the sales team never leaves the panel. This page shows how those leads
 * are doing (all from the CRM, no ad-platform API yet) and how to connect each
 * platform. Spend / cost-per-lead and campaign management come next.
 */
export default async function AdIntegrationsPage() {
  await requirePermission(PERMISSIONS.MANAGE_ADS);

  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const [stats, status] = await Promise.all([adLeadStats(), adConfigStatus()]);
  const peakWeek = Math.max(1, ...stats.weeks.map((w) => w.meta + w.google));

  const cards = [
    { label: "Total ad leads", value: stats.total, sub: null, icon: Users },
    { label: "This month", value: stats.thisMonth, sub: null, icon: TrendingUp },
    { label: "Facebook / Instagram", value: stats.byPlatform.meta, sub: null, icon: Megaphone },
    { label: "Google", value: stats.byPlatform.google, sub: null, icon: Search },
    {
      label: "Converted",
      value: stats.converted,
      sub: stats.total > 0 ? `${stats.conversionPct}% of leads` : null,
      icon: UserCheck,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ads"
        description="Run your ads and bring every lead straight into the panel — no more switching to Facebook or Google to see who enquired."
      />

      {/* ── Performance (from the CRM) ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
            <c.icon className="text-muted-foreground size-4" />
            <p className="mt-2 text-2xl font-semibold tabular-nums">{c.value}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {c.label}
              {c.sub ? ` · ${c.sub}` : ""}
            </p>
          </Card>
        ))}
      </div>

      {stats.total > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold">Last 8 weeks</h2>
            <div className="flex items-end justify-between gap-2">
              {stats.weeks.map((w) => (
                <div key={w.label} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-24 w-full flex-col justify-end overflow-hidden rounded">
                    <div
                      className="w-full bg-blue-500"
                      style={{ height: `${(w.meta / peakWeek) * 96}px` }}
                      title={`Facebook/Instagram: ${w.meta}`}
                    />
                    <div
                      className="w-full bg-rose-500"
                      style={{ height: `${(w.google / peakWeek) * 96}px` }}
                      title={`Google: ${w.google}`}
                    />
                  </div>
                  <span className="text-muted-foreground text-[10px]">{w.label}</span>
                </div>
              ))}
            </div>
            <div className="text-muted-foreground mt-3 flex gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-blue-500" /> Facebook/Instagram
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-rose-500" /> Google
              </span>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Top campaigns</h2>
            <div className="space-y-2.5">
              {stats.topCampaigns.map((c) => (
                <div key={c.campaign} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">{c.campaign}</span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {c.leads} lead{c.leads === 1 ? "" : "s"} · {c.converted} enrolled
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : (
        <Card className="text-muted-foreground p-6 text-center text-sm">
          Ad-lead performance — leads by platform and campaign, week by week, and
          how many convert to enrolments — appears here once your ads start
          sending leads in. Connect a platform below to begin.
        </Card>
      )}

      {/* ── Connect the platforms ──────────────────────────────────────────── */}
      <Card className="flex items-start gap-3 border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
        <Info className="mt-0.5 size-5 shrink-0 text-sky-600 dark:text-sky-400" />
        <div className="text-sm">
          <p className="font-medium">Connect your ad accounts</p>
          <p className="text-muted-foreground mt-0.5">
            Once connected, every ad lead lands in{" "}
            <Link href="/admin/leads" className="text-primary hover:underline">
              Leads
            </Link>{" "}
            automatically, tagged by platform and campaign, ready for your sales
            team.
          </p>
        </div>
      </Card>

      <AdConnectForm
        status={status}
        webhooks={{
          meta: `${base}/api/webhooks/meta/leads`,
          google: `${base}/api/webhooks/google/leads`,
        }}
        leads={{ meta: stats.byPlatform.meta, google: stats.byPlatform.google }}
      />

      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Rocket className="size-3.5" />
        Leads are de-duplicated on the platform&rsquo;s own lead id, so a retried
        delivery never creates the same person twice.
      </p>
    </div>
  );
}
