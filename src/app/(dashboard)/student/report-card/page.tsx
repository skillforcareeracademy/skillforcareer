import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { reportCardFor } from "@/server/services/performance-service";
import { getSettings } from "@/server/services/settings-service";
import { PageHeader } from "@/components/shared/page-header";
import { ReportCardDocument } from "@/components/report-card/report-card-document";
import { PrintReportButton } from "@/components/report-card/print-report-button";
import { ReportCardPrintStyles } from "@/components/report-card/print-styles";

export const metadata: Metadata = { title: "Report card" };
export const dynamic = "force-dynamic";

/** The learner's own report card — a tab of its own, as the academy asked. */
export default async function StudentReportCardPage() {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT]);
  const [{ learner, card }, { settings }] = await Promise.all([
    reportCardFor(user.id),
    getSettings(),
  ]);

  return (
    <div className="space-y-6">
      <ReportCardPrintStyles />
      <PageHeader
        title="Report card"
        description="Your attendance, marks and progress, course by course."
        actions={<PrintReportButton />}
      />
      <ReportCardDocument
        learner={learner}
        card={card}
        academyName={settings.siteName}
        generatedAt={new Date()}
      />
    </div>
  );
}
