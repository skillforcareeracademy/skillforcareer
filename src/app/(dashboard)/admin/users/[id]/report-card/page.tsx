import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { reportCardFor } from "@/server/services/performance-service";
import { getSettings } from "@/server/services/settings-service";
import { PageHeader } from "@/components/shared/page-header";
import { ButtonLink } from "@/components/shared/button-link";
import { Button } from "@/components/ui/button";
import { ReportCardDocument } from "@/components/report-card/report-card-document";
import { PrintReportButton } from "@/components/report-card/print-report-button";
import { ReportCardPrintStyles } from "@/components/report-card/print-styles";

export const metadata: Metadata = { title: "Report card" };
export const dynamic = "force-dynamic";

/** The office's copy of a learner's report card: the same sheet, plus a CSV. */
export default async function AdminReportCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
  const { id } = await params;

  let data;
  try {
    data = await reportCardFor(id);
  } catch {
    notFound();
  }
  const { settings } = await getSettings();

  return (
    <div className="space-y-6">
      <ReportCardPrintStyles />
      <PageHeader
        title={`${data.learner.name} — report card`}
        description="Course-wise attendance, marks and fees for this learner."
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/admin/users/${id}`} variant="ghost">
              <ArrowLeft className="size-4" /> Profile
            </ButtonLink>
            <Button variant="outline" nativeButton={false} render={<a href={`/api/admin/students/${id}/report-card`} />}>
              <Download className="size-4" /> CSV
            </Button>
            <PrintReportButton />
          </div>
        }
      />
      <ReportCardDocument
        learner={data.learner}
        card={data.card}
        academyName={settings.siteName}
        generatedAt={new Date()}
      />
    </div>
  );
}
