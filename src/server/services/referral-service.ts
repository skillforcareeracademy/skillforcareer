import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail/mailer";
import { birthdayGreeting, referralRewardEmail } from "@/lib/mail/templates/referral";
import { creditWallet } from "./wallet-service";
import { AppError } from "@/lib/api/errors";
import { notify } from "./notification-service";
import { getSettings } from "./settings-service";
import { istDateKey } from "@/lib/ist";

/**
 * Refer and earn, and the birthday voucher that carries it.
 *
 * The academy: on a learner's birthday they get wishes and a gift voucher with
 * their referral code; when somebody they referred pays for a seat, ₹5,000
 * lands in their wallet. The amount is a setting, not a number in the code.
 */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1

function randomCode(): string {
  const bytes = randomBytes(6);
  return `SFC${[...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("")}`;
}

/** The learner's code, made the first time anything asks for it. */
export async function ensureReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (user?.referralCode) return user.referralCode;

  for (let i = 0; i < 10; i += 1) {
    const code = randomCode();
    const taken = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (taken) continue;
    await prisma.user.update({ where: { id: userId }, data: { referralCode: code } });
    return code;
  }
  throw new Error("Could not allocate a referral code");
}

/**
 * The birthday code: a second, better-paying code that only works for a day
 * or two.
 *
 * The academy's own words to its learners: "on your birthday you get one
 * different referral code from which you get ₹5000 for per referral. This
 * referral code is valid for Birthday only." So it is issued on the morning of
 * the birthday, carries its own reward, and lapses on its own.
 */
export async function issueBirthdayCode(userId: string, days: number): Promise<string | null> {
  const expiresAt = new Date(Date.now() + Math.max(1, days) * 86_400_000);
  for (let i = 0; i < 10; i += 1) {
    const code = `BDAY${randomBytes(4)
      .toString("hex")
      .toUpperCase()
      .slice(0, 5)}`;
    // No unique index on the column (TiDB), so the check is here.
    const taken = await prisma.user.findFirst({
      where: { OR: [{ birthdayCode: code }, { referralCode: code }] },
      select: { id: true },
    });
    if (taken) continue;
    await prisma.user.update({
      where: { id: userId },
      data: { birthdayCode: code, birthdayCodeExpiresAt: expiresAt },
    });
    return code;
  }
  logger.warn("referral.birthday_code_failed", { userId });
  return null;
}

/** Who owns a code, if anyone. */
export interface CodeOwner {
  id: string;
  name: string;
  /** A birthday code pays its own (higher) reward. */
  kind: "STANDARD" | "BIRTHDAY";
}

export async function referrerFor(code: string): Promise<CodeOwner | null> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return null;

  const standing = await prisma.user.findUnique({
    where: { referralCode: trimmed },
    select: { id: true, name: true },
  });
  if (standing) return { ...standing, kind: "STANDARD" };

  // A birthday code counts only while it is still in date.
  const birthday = await prisma.user.findFirst({
    where: { birthdayCode: trimmed, birthdayCodeExpiresAt: { gt: new Date() } },
    select: { id: true, name: true },
  });
  return birthday ? { ...birthday, kind: "BIRTHDAY" } : null;
}

/**
 * Remember that this learner came in on somebody's code. Nothing is paid yet —
 * the reward lands when they pay for a seat.
 */
export async function attachReferral(code: string, refereeId: string): Promise<boolean> {
  const referrer = await referrerFor(code);
  if (!referrer || referrer.id === refereeId) return false;

  const already = await prisma.referral.findFirst({
    where: { refereeId },
    select: { id: true },
  });
  if (already) return false;

  // A birthday code's reward is settled now, while we know which code was
  // used — by the time it pays out, the code may have lapsed.
  const { settings } = await getSettings();
  const reward =
    referrer.kind === "BIRTHDAY"
      ? settings.birthdayReferralReward
      : settings.referralRewardAmount;

  await prisma.referral.create({
    data: {
      referrerId: referrer.id,
      refereeId,
      code: code.trim().toUpperCase(),
      status: "PENDING",
      rewardAmount: reward,
    },
  });
  return true;
}

/**
 * A referred learner has paid. Pay the person who sent them, once.
 *
 * Called from both fulfilment paths — the online checkout and a payment an
 * admin records by hand — because either one is the academy being paid.
 */
export async function rewardReferralFor(refereeId: string, referenceId?: string): Promise<void> {
  try {
    const referral = await prisma.referral.findFirst({
      where: { refereeId, status: "PENDING" },
      select: { id: true, referrerId: true, rewardAmount: true },
    });
    if (!referral) return;

    const [{ settings }, referee, referrer] = await Promise.all([
      getSettings(),
      prisma.user.findUnique({ where: { id: refereeId }, select: { name: true } }),
      prisma.user.findUnique({
        where: { id: referral.referrerId },
        select: { name: true, email: true },
      }),
    ]);
    // What the code was worth when it was used — a birthday code pays more —
    // falling back to today's standing reward for referrals raised before this
    // was recorded.
    const promised = Number(referral.rewardAmount ?? 0);
    const amount = promised > 0 ? promised : settings.referralRewardAmount;
    // The academy can switch the whole programme off; nothing is paid while it
    // is, and the referral simply stays pending.
    if (!settings.referralEnabled || amount <= 0 || !referrer) return;

    // Claim it first: two payments landing at once must not pay twice.
    const claimed = await prisma.referral.updateMany({
      where: { id: referral.id, status: "PENDING" },
      data: { status: "REWARDED", rewardAmount: amount },
    });
    if (claimed.count === 0) return;

    const balance = await creditWallet(
      referral.referrerId,
      amount,
      `Refer and earn — ${referee?.name ?? "a learner"} enrolled`,
      referenceId,
    );

    void notify({
      userIds: [referral.referrerId],
      type: "PAYMENT",
      title: `₹${amount.toLocaleString("en-IN")} added to your wallet`,
      message: `${referee?.name ?? "Someone"} enrolled with your referral code. Your balance is now ₹${balance.toLocaleString("en-IN")}.`,
      actionUrl: "/student/wallet",
    });
    void sendMail({
      to: referrer.email,
      ...referralRewardEmail({
        name: referrer.name,
        refereeName: referee?.name ?? "a new learner",
        amount,
        balance,
      }),
    }).catch(() => undefined);
  } catch (error) {
    // A reward that fails must never fail the payment that triggered it.
    logger.error("referral.reward_failed", {
      error: error instanceof Error ? error.message : String(error),
      refereeId,
    });
  }
}

/**
 * What a referred learner gets off their first enrolment.
 *
 * The academy's own wording to its learners is "share your referral code to
 * anyone for the enrollment discount", so the code works at both ends: the
 * friend pays less, and the referrer earns. The amount is a setting and starts
 * at zero, so nothing comes off a price until the academy says so.
 *
 * Only on the first seat they buy, and never more than the price itself.
 */
export async function referralDiscountFor(userId: string, payable: number): Promise<number> {
  try {
    const { settings } = await getSettings();
    const off = settings.referralDiscountAmount;
    if (!settings.referralEnabled || off <= 0 || payable <= 1) return 0;

    const referral = await prisma.referral.findFirst({
      where: { refereeId: userId, status: "PENDING" },
      select: { id: true },
    });
    if (!referral) return 0;

    // A second enrolment is at full price — this is a welcome, not a standing
    // discount.
    const bought = await prisma.payment.count({ where: { userId, status: "PAID" } });
    if (bought > 0) return 0;

    return Math.min(off, Math.floor(payable) - 1);
  } catch {
    return 0; // a discount that can't be worked out is simply not applied
  }
}

// ── The academy's view of the programme ──────────────────────────────────────

export interface ReferralRow {
  id: string;
  code: string;
  status: string;
  rewardAmount: number;
  at: string;
  referrerId: string;
  referrerName: string;
  referrerEmail: string;
  refereeName: string | null;
  refereeEmail: string | null;
  /** Whether the person they brought in has paid for a seat yet. */
  refereePaid: boolean;
}

export interface ReferralOverview {
  enabled: boolean;
  reward: number;
  /** What the referred friend gets off their first course. */
  discount: number;
  /** What a referral on the birthday code pays. */
  birthdayReward: number;
  minWithdrawal: number;
  withdrawalsEnabled: boolean;
  stats: {
    total: number;
    pending: number;
    rewarded: number;
    paidOut: number;
    heldInWallets: number;
    withdrawalsWaiting: number;
  };
  rows: ReferralRow[];
  topReferrers: { userId: string; name: string; email: string; code: string | null; rewarded: number; earned: number }[];
  total: number;
}

/**
 * Everything the Referral System page shows: how the programme is set, what it
 * has paid, and every referral with where it has got to.
 */
export async function referralOverview(query: {
  status?: string;
  search?: string;
  page: number;
  pageSize: number;
}): Promise<ReferralOverview> {
  const where = {
    ...(query.status ? { status: query.status as "PENDING" | "QUALIFIED" | "REWARDED" | "EXPIRED" } : {}),
    ...(query.search
      ? {
          OR: [
            { code: { contains: query.search } },
            { referrer: { name: { contains: query.search } } },
            { referrer: { email: { contains: query.search } } },
            { referee: { name: { contains: query.search } } },
            { referee: { email: { contains: query.search } } },
          ],
        }
      : {}),
  };

  const [{ settings }, total, rows, grouped, rewardedSum, wallets, withdrawalsWaiting] =
    await Promise.all([
      getSettings(),
      prisma.referral.count({ where }),
      prisma.referral.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          code: true,
          status: true,
          rewardAmount: true,
          createdAt: true,
          referrerId: true,
          referrer: { select: { name: true, email: true } },
          refereeId: true,
          referee: { select: { name: true, email: true } },
        },
      }),
      prisma.referral.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.referral.aggregate({ where: { status: "REWARDED" }, _sum: { rewardAmount: true } }),
      prisma.wallet.aggregate({ _sum: { balance: true } }),
      prisma.walletWithdrawal.count({ where: { status: "PENDING" } }),
    ]);

  // Who has actually paid, so a pending referral can be told from one that is
  // simply waiting on the person to buy something.
  const refereeIds = rows.map((r) => r.refereeId).filter((id): id is string => Boolean(id));
  const paid = refereeIds.length
    ? await prisma.payment.findMany({
        where: { userId: { in: refereeIds }, status: "PAID" },
        select: { userId: true },
      })
    : [];
  const hasPaid = new Set(paid.map((p) => p.userId));

  const counts = new Map(grouped.map((g) => [g.status, g._count._all]));

  // The league table, from the rewarded referrals themselves.
  const top = await prisma.referral.groupBy({
    by: ["referrerId"],
    where: { status: "REWARDED" },
    _count: { _all: true },
    _sum: { rewardAmount: true },
    orderBy: { _count: { referrerId: "desc" } },
    take: 10,
  });
  const topUsers = top.length
    ? await prisma.user.findMany({
        where: { id: { in: top.map((t) => t.referrerId) } },
        select: { id: true, name: true, email: true, referralCode: true },
      })
    : [];
  const byId = new Map(topUsers.map((u) => [u.id, u]));

  return {
    enabled: settings.referralEnabled,
    reward: settings.referralRewardAmount,
    discount: settings.referralDiscountAmount,
    birthdayReward: settings.birthdayReferralReward,
    minWithdrawal: settings.walletMinWithdrawal,
    withdrawalsEnabled: settings.walletWithdrawalsEnabled,
    stats: {
      total: [...counts.values()].reduce((a, b) => a + b, 0),
      pending: counts.get("PENDING") ?? 0,
      rewarded: counts.get("REWARDED") ?? 0,
      paidOut: Number(rewardedSum._sum.rewardAmount ?? 0),
      heldInWallets: Number(wallets._sum.balance ?? 0),
      withdrawalsWaiting,
    },
    rows: rows.map((r) => ({
      id: r.id,
      code: r.code,
      status: r.status,
      rewardAmount: Number(r.rewardAmount),
      at: r.createdAt.toISOString(),
      referrerId: r.referrerId,
      referrerName: r.referrer.name,
      referrerEmail: r.referrer.email,
      refereeName: r.referee?.name ?? null,
      refereeEmail: r.referee?.email ?? null,
      refereePaid: r.refereeId ? hasPaid.has(r.refereeId) : false,
    })),
    topReferrers: top.map((t) => {
      const u = byId.get(t.referrerId);
      return {
        userId: t.referrerId,
        name: u?.name ?? "—",
        email: u?.email ?? "",
        code: u?.referralCode ?? null,
        rewarded: t._count._all,
        earned: Number(t._sum.rewardAmount ?? 0),
      };
    }),
    total,
  };
}

/**
 * Pay a referral by hand — for the case the academy honours one that never
 * qualified on its own (an offline admission, say).
 */
export async function payReferralByHand(id: string): Promise<void> {
  const referral = await prisma.referral.findUnique({
    where: { id },
    select: { id: true, status: true, referrerId: true, referee: { select: { name: true } } },
  });
  if (!referral) throw AppError.notFound("Referral not found.");
  if (referral.status === "REWARDED") throw AppError.badRequest("This one has already been paid.");

  const { settings } = await getSettings();
  const amount = settings.referralRewardAmount;
  if (amount <= 0) throw AppError.badRequest("Set a reward amount first.");

  const claimed = await prisma.referral.updateMany({
    where: { id, status: { not: "REWARDED" } },
    data: { status: "REWARDED", rewardAmount: amount },
  });
  if (claimed.count === 0) throw AppError.badRequest("This one has already been paid.");

  const balance = await creditWallet(
    referral.referrerId,
    amount,
    `Refer and earn — ${referral.referee?.name ?? "a learner"} (paid by the academy)`,
    id,
  );
  void notify({
    userIds: [referral.referrerId],
    type: "PAYMENT",
    title: `₹${amount.toLocaleString("en-IN")} added to your wallet`,
    message: `Your referral has been honoured. Your balance is now ₹${balance.toLocaleString("en-IN")}.`,
    actionUrl: "/student/wallet",
  });
}

/**
 * Give a learner a code from the panel — the academy's "referral code also can
 * be created from admin side". A code they choose themselves is allowed as long
 * as nobody else holds it; leave it blank and one is generated.
 */
export async function setReferralCodeByAdmin(
  userId: string,
  wanted?: string | null,
): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, referralCode: true },
  });
  if (!user) throw AppError.notFound("That learner no longer exists.");

  if (!wanted?.trim()) {
    // Nothing chosen: the usual generated one (and an existing code stands).
    return ensureReferralCode(userId);
  }

  const code = wanted.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9-]{4,20}$/.test(code)) {
    throw AppError.badRequest("A code is 4–20 letters, numbers or dashes.");
  }
  const taken = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } });
  if (taken && taken.id !== userId) throw AppError.conflict("Somebody already has that code.");

  await prisma.user.update({ where: { id: userId }, data: { referralCode: code } });
  void notify({
    userIds: [userId],
    type: "SYSTEM",
    title: "Your referral code is ready",
    message: `Share ${code} — when a friend enrolls with it, the reward lands in your wallet.`,
    actionUrl: "/student/wallet",
  });
  return code;
}

export interface ReferralCodeRow {
  userId: string;
  name: string;
  email: string;
  code: string;
  /** How many people have signed up on this code, and how many have paid out. */
  used: number;
  rewarded: number;
  earned: number;
  balance: number;
}

/**
 * Every code the academy has handed out, with how hard it is working:
 * "how many times any code used and how many amount earned by any student".
 */
export async function referralCodes(query: {
  search?: string;
  page: number;
  pageSize: number;
}): Promise<{ rows: ReferralCodeRow[]; total: number }> {
  const where = {
    referralCode: { not: null },
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search } },
            { email: { contains: query.search } },
            { referralCode: { contains: query.search.toUpperCase() } },
          ],
        }
      : {}),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: { id: true, name: true, email: true, referralCode: true },
    }),
  ]);
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return { rows: [], total };

  const [used, rewarded, wallets] = await Promise.all([
    prisma.referral.groupBy({
      by: ["referrerId"],
      where: { referrerId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.referral.groupBy({
      by: ["referrerId"],
      where: { referrerId: { in: ids }, status: "REWARDED" },
      _count: { _all: true },
      _sum: { rewardAmount: true },
    }),
    prisma.wallet.findMany({ where: { userId: { in: ids } }, select: { userId: true, balance: true } }),
  ]);
  const usedBy = new Map(used.map((u) => [u.referrerId, u._count._all]));
  const rewardedBy = new Map(rewarded.map((r) => [r.referrerId, r]));
  const balanceBy = new Map(wallets.map((w) => [w.userId, Number(w.balance)]));

  return {
    total,
    rows: users.map((u) => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      code: u.referralCode!,
      used: usedBy.get(u.id) ?? 0,
      rewarded: rewardedBy.get(u.id)?._count._all ?? 0,
      earned: Number(rewardedBy.get(u.id)?._sum.rewardAmount ?? 0),
      balance: balanceBy.get(u.id) ?? 0,
    })),
  };
}

/** Close a referral without paying it — a duplicate, or one that lapsed. */
export async function cancelReferral(id: string): Promise<void> {
  const referral = await prisma.referral.findUnique({ where: { id }, select: { status: true } });
  if (!referral) throw AppError.notFound("Referral not found.");
  if (referral.status === "REWARDED") {
    throw AppError.badRequest("This one has been paid — it can't be cancelled.");
  }
  await prisma.referral.update({ where: { id }, data: { status: "EXPIRED" } });
}

// ── Birthdays ────────────────────────────────────────────────────────────────

export interface BirthdayRunResult {
  wished: number;
  failed: number;
}

/**
 * The morning's birthdays: wishes, and a voucher carrying the learner's own
 * referral code. One greeting per person per year, however often this runs.
 */
export async function sendBirthdayGreetings(now: Date = new Date()): Promise<BirthdayRunResult> {
  const today = istDateKey(now); // YYYY-MM-DD in academy time
  const [, month, day] = today.split("-");
  const result: BirthdayRunResult = { wished: 0, failed: 0 };

  // MySQL/TiDB can compare the month and day without pulling every learner
  // into memory. `dateOfBirth` is stored at UTC midnight, as the profile saves it.
  const rows = await prisma.$queryRaw<{ id: string; name: string; email: string }[]>`
    SELECT id, name, email FROM User
    WHERE status = 'ACTIVE'
      AND dateOfBirth IS NOT NULL
      AND MONTH(dateOfBirth) = ${Number(month)}
      AND DAY(dateOfBirth) = ${Number(day)}
      AND (lastBirthdayWishAt IS NULL OR YEAR(lastBirthdayWishAt) < ${Number(today.slice(0, 4))})
    LIMIT 200
  `;
  if (rows.length === 0) return result;

  const { settings } = await getSettings();
  // The voucher only goes out while refer-and-earn is on; the wishes always do.
  const refer = settings.referralEnabled && settings.referralRewardAmount > 0;
  for (const person of rows) {
    try {
      // The standing code stays theirs; the birthday brings a second one that
      // pays more and lapses. Both go in the greeting.
      const code = refer ? await ensureReferralCode(person.id) : null;
      const birthdayCode =
        refer && settings.birthdayReferralReward > 0
          ? await issueBirthdayCode(person.id, settings.birthdayCodeDays)
          : null;
      await prisma.user.update({
        where: { id: person.id },
        data: { lastBirthdayWishAt: now },
      });
      void notify({
        userIds: [person.id],
        type: "ANNOUNCEMENT",
        title: `Happy birthday, ${person.name.split(" ")[0]}!`,
        message: birthdayCode
          ? `Everyone at ${settings.siteName} wishes you a wonderful year. Your birthday gift: the code ${birthdayCode} pays you ₹${settings.birthdayReferralReward.toLocaleString("en-IN")} for every friend who enrolls with it — it is good for today only.`
          : code
            ? `Everyone at ${settings.siteName} wishes you a wonderful year. Here's your gift: share your referral code ${code} and earn ₹${settings.referralRewardAmount.toLocaleString("en-IN")} in your wallet for every friend who enrolls.`
            : `Everyone at ${settings.siteName} wishes you a wonderful year ahead.`,
        actionUrl: code ? "/student/wallet" : "/student",
      });
      const sent = await sendMail({
        to: person.email,
        ...birthdayGreeting({
          name: person.name,
          code: birthdayCode ?? code,
          reward: birthdayCode
            ? settings.birthdayReferralReward
            : refer
              ? settings.referralRewardAmount
              : undefined,
          birthdayOnly: Boolean(birthdayCode),
          days: settings.birthdayCodeDays,
          siteName: settings.siteName,
        }),
      });
      if (sent) result.wished += 1;
      else result.failed += 1;
    } catch (error) {
      result.failed += 1;
      logger.error("birthday.greeting_failed", {
        error: error instanceof Error ? error.message : String(error),
        userId: person.id,
      });
    }
  }
  return result;
}
