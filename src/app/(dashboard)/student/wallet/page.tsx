import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { prisma } from "@/lib/prisma";
import { getWalletView } from "@/server/services/wallet-service";
import { ensureReferralCode } from "@/server/services/referral-service";
import { getSettings } from "@/server/services/settings-service";
import { StudentWalletClient } from "@/components/student/student-wallet-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Wallet" };

export default async function StudentWalletPage() {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT]);
  const [wallet, { settings }, referredCount] = await Promise.all([
    getWalletView(user.id),
    getSettings(),
    prisma.referral.count({ where: { referrerId: user.id, status: "REWARDED" } }),
  ]);
  // No code is handed out while refer-and-earn is switched off in
  // Admin → Referral System; the balance and its history still show.
  const code = settings.referralEnabled ? await ensureReferralCode(user.id) : "";

  return (
    <StudentWalletClient
      balance={wallet.balance}
      transactions={wallet.transactions}
      withdrawals={wallet.withdrawals}
      referralCode={code}
      referralEnabled={settings.referralEnabled}
      reward={settings.referralRewardAmount}
      discount={settings.referralDiscountAmount}
      minWithdrawal={wallet.minWithdrawal}
      withdrawalsEnabled={wallet.withdrawalsEnabled}
      referredCount={referredCount}
    />
  );
}
