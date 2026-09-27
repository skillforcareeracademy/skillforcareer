import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { notify } from "./notification-service";
import { getSettings } from "./settings-service";

/**
 * The learner's wallet — what refer-and-earn pays into, and what they can ask
 * to be paid out of.
 *
 * The academy's rules: a learner can ask for their money; an admin pays it and
 * marks it paid; and an admin can add to, take off, or zero any balance from
 * the panel. Every movement leaves a `WalletTransaction` behind, so a balance
 * can always be explained.
 */

const money = (d: Prisma.Decimal) => Number(d);

export interface WalletTxnRow {
  id: string;
  type: "CREDIT" | "DEBIT";
  amount: number;
  reason: string;
  at: string;
}

export interface WithdrawalRow {
  id: string;
  amount: number;
  status: string;
  payoutNote: string | null;
  adminNote: string | null;
  at: string;
  processedAt: string | null;
  /** Only the admin screens fill these. */
  userName?: string;
  userEmail?: string;
  userId?: string;
}

export interface WalletView {
  balance: number;
  currency: string;
  transactions: WalletTxnRow[];
  withdrawals: WithdrawalRow[];
  minWithdrawal: number;
  withdrawalsEnabled: boolean;
}

/** Everyone gets a wallet the first time anything touches it. */
export async function getOrCreateWallet(userId: string) {
  const existing = await prisma.wallet.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.wallet.create({ data: { userId } });
}

export async function getWalletView(userId: string): Promise<WalletView> {
  const [wallet, { settings }] = await Promise.all([getOrCreateWallet(userId), getSettings()]);
  const [transactions, withdrawals] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, type: true, amount: true, reason: true, createdAt: true },
    }),
    prisma.walletWithdrawal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        amount: true,
        status: true,
        payoutNote: true,
        adminNote: true,
        createdAt: true,
        processedAt: true,
      },
    }),
  ]);

  return {
    balance: money(wallet.balance),
    currency: wallet.currency,
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: money(t.amount),
      reason: t.reason,
      at: t.createdAt.toISOString(),
    })),
    withdrawals: withdrawals.map((w) => ({
      id: w.id,
      amount: money(w.amount),
      status: w.status,
      payoutNote: w.payoutNote,
      adminNote: w.adminNote,
      at: w.createdAt.toISOString(),
      processedAt: w.processedAt ? w.processedAt.toISOString() : null,
    })),
    minWithdrawal: settings.walletMinWithdrawal,
    withdrawalsEnabled: settings.walletWithdrawalsEnabled,
  };
}

/** Put money in. Returns the new balance. */
export async function creditWallet(
  userId: string,
  amount: number,
  reason: string,
  referenceId?: string,
): Promise<number> {
  if (amount <= 0) throw AppError.badRequest("Enter an amount above zero.");
  const wallet = await getOrCreateWallet(userId);
  const [updated] = await prisma.$transaction([
    prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: amount } },
      select: { balance: true },
    }),
    prisma.walletTransaction.create({
      data: { walletId: wallet.id, type: "CREDIT", amount, reason, referenceId: referenceId ?? null },
    }),
  ]);
  return money(updated.balance);
}

/** Take money out. Refuses to go below zero. */
export async function debitWallet(
  userId: string,
  amount: number,
  reason: string,
  referenceId?: string,
): Promise<number> {
  if (amount <= 0) throw AppError.badRequest("Enter an amount above zero.");
  const wallet = await getOrCreateWallet(userId);
  if (money(wallet.balance) < amount) {
    throw AppError.badRequest("That is more than the wallet holds.");
  }
  const [updated] = await prisma.$transaction([
    prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: amount } },
      select: { balance: true },
    }),
    prisma.walletTransaction.create({
      data: { walletId: wallet.id, type: "DEBIT", amount, reason, referenceId: referenceId ?? null },
    }),
  ]);
  return money(updated.balance);
}

/**
 * An admin's hand on a balance: add to it, take off it, or set it to a figure
 * (zero included). The learner is told what changed and why.
 */
export async function adjustWalletByAdmin(
  userId: string,
  input: { mode: "CREDIT" | "DEBIT" | "SET"; amount: number; reason?: string },
): Promise<number> {
  const wallet = await getOrCreateWallet(userId);
  const current = money(wallet.balance);
  const reason = input.reason?.trim() || "Adjusted by the academy";

  let balance = current;
  if (input.mode === "CREDIT") {
    balance = await creditWallet(userId, input.amount, reason);
  } else if (input.mode === "DEBIT") {
    balance = await debitWallet(userId, Math.min(input.amount, current), reason);
  } else {
    const target = Math.max(0, input.amount);
    if (target > current) balance = await creditWallet(userId, target - current, reason);
    else if (target < current) balance = await debitWallet(userId, current - target, reason);
  }

  void notify({
    userIds: [userId],
    type: "SYSTEM",
    title: "Your wallet was updated",
    message: `${reason}. Your balance is now ₹${balance.toLocaleString("en-IN")}.`,
    actionUrl: "/student/wallet",
  });
  return balance;
}

// ── Withdrawals ──────────────────────────────────────────────────────────────

/**
 * The learner asks for their money. The balance is held straight away — it is
 * theirs to spend once, not twice — and given back if the request is refused.
 */
export async function requestWithdrawal(
  userId: string,
  input: { amount: number; payoutNote?: string },
): Promise<WithdrawalRow> {
  const { settings } = await getSettings();
  if (!settings.walletWithdrawalsEnabled) {
    throw AppError.badRequest("Withdrawals are switched off at the moment.");
  }
  if (settings.walletMinWithdrawal > 0 && input.amount < settings.walletMinWithdrawal) {
    throw AppError.badRequest(
      `The smallest withdrawal is ₹${settings.walletMinWithdrawal.toLocaleString("en-IN")}.`,
    );
  }
  const pending = await prisma.walletWithdrawal.findFirst({
    where: { userId, status: "PENDING" },
    select: { id: true },
  });
  if (pending) throw AppError.badRequest("You already have a request waiting.");

  await debitWallet(userId, input.amount, "Withdrawal requested");
  const row = await prisma.walletWithdrawal.create({
    data: { userId, amount: input.amount, payoutNote: input.payoutNote?.trim() || null },
    select: { id: true, amount: true, status: true, payoutNote: true, createdAt: true },
  });

  const who = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  void notify({
    userIds: await staffIds(),
    type: "PAYMENT",
    title: "Wallet withdrawal requested",
    message: `${who?.name ?? "A learner"} has asked for ₹${input.amount.toLocaleString("en-IN")} from their wallet.`,
    actionUrl: "/admin/wallets",
  });

  return {
    id: row.id,
    amount: money(row.amount),
    status: row.status,
    payoutNote: row.payoutNote,
    adminNote: null,
    at: row.createdAt.toISOString(),
    processedAt: null,
  };
}

async function staffIds(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { status: "ACTIVE", role: { slug: { in: ["SUPER_ADMIN", "ADMIN"] } } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function settleWithdrawal(
  id: string,
  adminId: string,
  input: { status: "PAID" | "REJECTED"; adminNote?: string },
): Promise<void> {
  const row = await prisma.walletWithdrawal.findUnique({
    where: { id },
    select: { id: true, userId: true, amount: true, status: true },
  });
  if (!row) throw AppError.notFound("Request not found.");
  if (row.status !== "PENDING") throw AppError.badRequest("That request has already been settled.");

  await prisma.walletWithdrawal.update({
    where: { id },
    data: {
      status: input.status,
      adminNote: input.adminNote?.trim() || null,
      processedById: adminId,
      processedAt: new Date(),
    },
  });

  const amount = money(row.amount);
  if (input.status === "REJECTED") {
    // The hold goes back where it came from.
    await creditWallet(row.userId, amount, "Withdrawal request declined", id);
  }
  void notify({
    userIds: [row.userId],
    type: "PAYMENT",
    title: input.status === "PAID" ? "Your withdrawal has been paid" : "Your withdrawal was declined",
    message:
      input.status === "PAID"
        ? `₹${amount.toLocaleString("en-IN")} has been sent to you.${input.adminNote ? ` ${input.adminNote}` : ""}`
        : `₹${amount.toLocaleString("en-IN")} is back in your wallet.${input.adminNote ? ` ${input.adminNote}` : ""}`,
    actionUrl: "/student/wallet",
  });
}

// ── The admin's list ─────────────────────────────────────────────────────────

export interface AdminWalletsView {
  pending: WithdrawalRow[];
  settled: WithdrawalRow[];
  wallets: {
    userId: string;
    name: string;
    email: string;
    balance: number;
    referralCode: string | null;
    referrals: number;
  }[];
  totalHeld: number;
}

export async function adminWalletsView(search?: string): Promise<AdminWalletsView> {
  const [withdrawals, wallets] = await Promise.all([
    prisma.walletWithdrawal.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        amount: true,
        status: true,
        payoutNote: true,
        adminNote: true,
        createdAt: true,
        processedAt: true,
        userId: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.wallet.findMany({
      where: search
        ? {
            user: {
              OR: [
                { name: { contains: search } },
                { email: { contains: search } },
              ],
            },
          }
        : {},
      orderBy: { balance: "desc" },
      take: 50,
      select: {
        userId: true,
        balance: true,
        user: { select: { name: true, email: true, referralCode: true } },
      },
    }),
  ]);

  const referralCounts = await prisma.referral.groupBy({
    by: ["referrerId"],
    where: { referrerId: { in: wallets.map((w) => w.userId) }, status: "REWARDED" },
    _count: { _all: true },
  });
  const rewarded = new Map(referralCounts.map((r) => [r.referrerId, r._count._all]));

  const rows: WithdrawalRow[] = withdrawals.map((w) => ({
    id: w.id,
    amount: money(w.amount),
    status: w.status,
    payoutNote: w.payoutNote,
    adminNote: w.adminNote,
    at: w.createdAt.toISOString(),
    processedAt: w.processedAt ? w.processedAt.toISOString() : null,
    userId: w.userId,
    userName: w.user.name,
    userEmail: w.user.email,
  }));

  return {
    pending: rows.filter((r) => r.status === "PENDING"),
    settled: rows.filter((r) => r.status !== "PENDING").slice(0, 25),
    wallets: wallets.map((w) => ({
      userId: w.userId,
      name: w.user.name,
      email: w.user.email,
      balance: money(w.balance),
      referralCode: w.user.referralCode,
      referrals: rewarded.get(w.userId) ?? 0,
    })),
    totalHeld: wallets.reduce((sum, w) => sum + money(w.balance), 0),
  };
}
