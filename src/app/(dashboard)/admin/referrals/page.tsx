import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { referralCodes, referralOverview } from "@/server/services/referral-service";
import { listStudentsForSelect } from "@/server/services/assignment-service";
import { ReferralsClient } from "@/components/admin/referrals-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Referral System" };

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length ? v : undefined;
}

/**
 * Refer and earn, end to end. The academy asked for it as its own option for
 * the Super Admin; admins who manage payments see it too, and it can be taken
 * off them from Roles like anything else.
 */
export default async function ReferralsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = str(sp.status);
  const search = str(sp.search);
  const codeSearch = str(sp.codeSearch);
  const codePage = Math.max(1, Number(sp.codePage) || 1);
  const [view, codes, learners] = await Promise.all([
    referralOverview({ status, search, page, pageSize: 20 }),
    referralCodes({ search: codeSearch, page: codePage, pageSize: 10 }),
    listStudentsForSelect(),
  ]);

  return (
    <ReferralsClient
      enabled={view.enabled}
      reward={view.reward}
      discount={view.discount}
      withdrawalsEnabled={view.withdrawalsEnabled}
      minWithdrawal={view.minWithdrawal}
      stats={view.stats}
      rows={view.rows}
      topReferrers={view.topReferrers}
      total={view.total}
      page={page}
      pageSize={20}
      status={status}
      search={search}
      codes={codes.rows}
      codesTotal={codes.total}
      codePage={codePage}
      codeSearch={codeSearch}
      learners={learners}
    />
  );
}
