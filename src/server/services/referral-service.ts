import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail/mailer";
import { birthdayGreeting, referralRewardEmail } from "@/lib/mail/templates/referral";
import { creditWallet } from "./wallet-service";
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

/** Who owns a code, if anyone. */
export async function referrerFor(code: string): Promise<{ id: string; name: string } | null> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return null;
  return prisma.user.findUnique({
    where: { referralCode: trimmed },
    select: { id: true, name: true },
  });
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

  await prisma.referral.create({
    data: {
      referrerId: referrer.id,
      refereeId,
      code: code.trim().toUpperCase(),
      status: "PENDING",
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
      select: { id: true, referrerId: true },
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
    const amount = settings.referralRewardAmount;
    if (amount <= 0 || !referrer) return;

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
  for (const person of rows) {
    try {
      const code = await ensureReferralCode(person.id);
      await prisma.user.update({
        where: { id: person.id },
        data: { lastBirthdayWishAt: now },
      });
      void notify({
        userIds: [person.id],
        type: "ANNOUNCEMENT",
        title: `Happy birthday, ${person.name.split(" ")[0]}!`,
        message: `Everyone at ${settings.siteName} wishes you a wonderful year. Here's your gift: share your referral code ${code} and earn ₹${settings.referralRewardAmount.toLocaleString("en-IN")} in your wallet for every friend who enrolls.`,
        actionUrl: "/student/wallet",
      });
      const sent = await sendMail({
        to: person.email,
        ...birthdayGreeting({
          name: person.name,
          code,
          reward: settings.referralRewardAmount,
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
