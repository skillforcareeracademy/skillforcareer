"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Cake,
  Check,
  Copy,
  Gift,
  Loader2,
  Wallet as WalletIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Txn {
  id: string;
  type: "CREDIT" | "DEBIT";
  amount: number;
  reason: string;
  at: string;
}
interface Withdrawal {
  id: string;
  amount: number;
  status: string;
  payoutNote: string | null;
  adminNote: string | null;
  at: string;
  processedAt: string | null;
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * The learner's wallet: what refer-and-earn has paid them, their own code to
 * share, and the way to ask for the money.
 */
export function StudentWalletClient({
  balance,
  transactions,
  withdrawals,
  referralCode,
  referralEnabled,
  reward,
  discount,
  birthdayCode,
  birthdayReward,
  minWithdrawal,
  withdrawalsEnabled,
  referredCount,
}: {
  balance: number;
  transactions: Txn[];
  withdrawals: Withdrawal[];
  referralCode: string;
  /** Off in Admin → Referral System: no code, no earning line. */
  referralEnabled: boolean;
  reward: number;
  /** What the friend gets off their first course; 0 = no discount. */
  discount: number;
  /** Today's birthday code, if the learner has one in date. */
  birthdayCode: string | null;
  birthdayReward: number;
  minWithdrawal: number;
  withdrawalsEnabled: boolean;
  referredCount: number;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [payoutNote, setPayoutNote] = useState("");
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const pending = withdrawals.find((w) => w.status === "PENDING");

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the code and copy it by hand.");
    }
  }

  async function withdraw(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const res = await api.post<{ message: string }>("/api/wallet/withdrawals", {
        amount: Number(amount),
        payoutNote: payoutNote.trim() || undefined,
      });
      toast.success(res.message);
      setAmount("");
      setPayoutNote("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't send that.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wallet"
        description="What you've earned by referring friends, and how to take it out."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="py-6 text-center">
            <div className="bg-primary/10 text-primary mx-auto mb-3 grid size-12 place-items-center rounded-2xl">
              <WalletIcon className="size-6" />
            </div>
            <p className="text-3xl font-bold tabular-nums">{rupees(balance)}</p>
            <p className="text-muted-foreground mt-1 text-xs">Available balance</p>
            {referredCount > 0 && (
              <p className="text-muted-foreground mt-3 text-xs">
                {referredCount} friend{referredCount === 1 ? "" : "s"} enrolled with your code
              </p>
            )}
          </CardContent>
        </Card>

        {/* The code itself — the gift voucher's code, and the birthday email's. */}
        {referralEnabled && (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="size-4" /> Refer and earn
            </CardTitle>
            <CardDescription>
              Share your code. When a friend enrolls with it, {rupees(reward)} is added here
              {discount > 0 ? `. They get ${rupees(discount)}/- discount on enrollment` : ""}. You
              can withdraw it in your bank.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              <code className="bg-muted rounded-lg px-4 py-2 text-lg font-semibold tracking-widest">
                {referralCode}
              </code>
              <Button variant="outline" size="sm" onClick={copyCode}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy code"}
              </Button>
            </div>

            {/* The birthday code, while it lasts — a different code, worth
                more, and gone tomorrow. */}
            {birthdayCode && (
              <div className="border-primary/30 bg-primary/5 mt-3 rounded-xl border p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Cake className="size-4" /> Your birthday code
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="bg-background rounded-lg px-3 py-1.5 font-semibold tracking-widest">
                    {birthdayCode}
                  </code>
                  <span className="text-muted-foreground text-xs">
                    {rupees(birthdayReward)} per referral · valid today only
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Withdraw</CardTitle>
            <CardDescription>
              {withdrawalsEnabled
                ? `The academy pays it into your account. Smallest withdrawal ${rupees(minWithdrawal)}.`
                : "Withdrawals are switched off at the moment."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pending ? (
              <p className="text-sm">
                Your request for <strong>{rupees(pending.amount)}</strong> is with the academy.
                They&apos;ll pay it and you&apos;ll hear from us.
              </p>
            ) : withdrawalsEnabled ? (
              <form onSubmit={withdraw} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="w-amount">Amount</Label>
                  <Input
                    id="w-amount"
                    type="number"
                    min={minWithdrawal || 1}
                    max={balance}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={String(minWithdrawal || 500)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="w-note">Where should it go?</Label>
                  <Textarea
                    id="w-note"
                    rows={2}
                    value={payoutNote}
                    onChange={(e) => setPayoutNote(e.target.value)}
                    placeholder="UPI id, or your bank account and IFSC"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={
                    sending || !amount || Number(amount) <= 0 || Number(amount) > balance
                  }
                >
                  {sending && <Loader2 className="size-4 animate-spin" />}
                  Request withdrawal
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
            <CardDescription>Every movement in and out.</CardDescription>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing here yet.</p>
            ) : (
              <ul className="space-y-3">
                {transactions.map((t) => (
                  <li key={t.id} className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
                        t.type === "CREDIT"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {t.type === "CREDIT" ? (
                        <ArrowDownLeft className="size-4" />
                      ) : (
                        <ArrowUpRight className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{t.reason}</p>
                      <p className="text-muted-foreground text-xs">
                        {new Date(t.at).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-sm font-semibold tabular-nums",
                        t.type === "CREDIT" ? "text-emerald-600 dark:text-emerald-400" : "",
                      )}
                    >
                      {t.type === "CREDIT" ? "+" : "−"}
                      {rupees(t.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {withdrawals.length > 0 && (
              <div className="mt-5 space-y-2 border-t pt-4">
                <p className="text-sm font-medium">Withdrawal requests</p>
                {withdrawals.map((w) => (
                  <div key={w.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {rupees(w.amount)}{" "}
                      <span className="text-muted-foreground text-xs">
                        {new Date(w.at).toLocaleDateString("en-IN")}
                      </span>
                    </span>
                    <Badge
                      variant="secondary"
                      className={
                        w.status === "PAID"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                          : w.status === "REJECTED"
                            ? "bg-muted text-muted-foreground"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                      }
                    >
                      {w.status === "PAID" ? "Paid" : w.status === "REJECTED" ? "Declined" : "Waiting"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
