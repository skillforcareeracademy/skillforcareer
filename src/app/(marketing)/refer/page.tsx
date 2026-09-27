import type { Metadata } from "next";
import Link from "next/link";
import { BadgeIndianRupee, Gift, Share2, UserPlus, Wallet } from "lucide-react";
import { getSettings } from "@/server/services/settings-service";
import { getSessionUser } from "@/lib/auth/api-guard";
import { ensureReferralCode } from "@/server/services/referral-service";
import { ButtonLink } from "@/components/shared/button-link";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Refer and earn",
  description: "Share your code, and earn every time a friend enrols.",
};

/**
 * "Refer Now" from the website menu.
 *
 * A signed-in learner sees their own code straight away; a visitor is told what
 * the programme pays and sent to sign in or create an account. Either way they
 * leave knowing the number.
 */
export default async function ReferPage() {
  const [{ settings }, user] = await Promise.all([getSettings(), getSessionUser()]);
  const reward = `₹${settings.referralRewardAmount.toLocaleString("en-IN")}`;
  const code =
    user && settings.referralEnabled ? await ensureReferralCode(user.id).catch(() => null) : null;

  const discount =
    settings.referralDiscountAmount > 0
      ? `₹${settings.referralDiscountAmount.toLocaleString("en-IN")}`
      : null;

  const steps = [
    {
      icon: Share2,
      title: "Share your code",
      body: "Every learner gets a code the moment they sign up — it's in your wallet, and in your birthday voucher.",
    },
    {
      icon: UserPlus,
      title: "Your friend enrols",
      body: discount
        ? `They enter your code when they create their account — and ${discount} comes off their first course.`
        : "They enter your code when they create their account, and enrol on any course.",
    },
    {
      icon: BadgeIndianRupee,
      title: `You earn ${reward}`,
      body: "It lands in your wallet as soon as their payment is recorded, and you can withdraw it.",
    },
  ];

  return (
    <div className="container-page py-14 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <span className="bg-primary/10 text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
          <Gift className="size-3.5" /> Refer and earn
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          Bring a friend along, and earn {reward}
        </h1>
        <p className="text-muted-foreground mx-auto mt-3 max-w-xl text-balance">
          {settings.referralEnabled
            ? "You don't have to be enrolled to share your code — the reward is yours either way, straight into your wallet."
            : "Our referral programme is paused at the moment. Please check back soon."}
        </p>

        {settings.referralEnabled && (
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            {code ? (
              <>
                <span className="bg-muted rounded-xl px-5 py-3 text-lg font-semibold tracking-widest">
                  {code}
                </span>
                <ButtonLink href="/student/wallet" size="lg">
                  <Wallet className="size-4" /> Open your wallet
                </ButtonLink>
              </>
            ) : (
              <>
                <ButtonLink href="/register" size="lg">
                  Create an account
                </ButtonLink>
                <ButtonLink href="/login?next=%2Fstudent%2Fwallet" size="lg" variant="outline">
                  Sign in to get your code
                </ButtonLink>
              </>
            )}
          </div>
        )}
      </div>

      <div className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-3">
        {steps.map((step, i) => (
          <Card key={step.title}>
            <CardContent className="space-y-2 py-6">
              <div className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl">
                <step.icon className="size-5" />
              </div>
              <p className="text-muted-foreground text-xs font-semibold">Step {i + 1}</p>
              <p className="font-semibold">{step.title}</p>
              <p className="text-muted-foreground text-sm">{step.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-muted-foreground mx-auto mt-10 max-w-2xl text-center text-xs">
        The reward is paid once per friend, when their payment is recorded — online or by the
        academy. Withdrawals are paid to the account you give us.{" "}
        <Link href="/terms" className="hover:underline">
          Terms apply
        </Link>
        .
      </p>
    </div>
  );
}
