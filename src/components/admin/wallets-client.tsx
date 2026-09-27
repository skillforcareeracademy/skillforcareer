"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeIndianRupee, Check, Loader2, Wallet as WalletIcon, X } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface WithdrawalRow {
  id: string;
  amount: number;
  status: string;
  payoutNote: string | null;
  adminNote: string | null;
  at: string;
  processedAt: string | null;
  userId?: string;
  userName?: string;
  userEmail?: string;
}
interface WalletRow {
  userId: string;
  name: string;
  email: string;
  balance: number;
  referralCode: string | null;
  referrals: number;
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

const MODES = [
  { value: "CREDIT", label: "Add to balance" },
  { value: "DEBIT", label: "Take off balance" },
  { value: "SET", label: "Set balance to" },
];

/**
 * Wallets, from the academy's side: pay out what learners have asked for, and
 * put right any balance by hand — "admin manually balance kam ya zero bhi kr
 * skta hai kisi ka bhi apne admin panel se".
 */
export function WalletsClient({
  pending,
  settled,
  wallets,
  totalHeld,
}: {
  pending: WithdrawalRow[];
  settled: WithdrawalRow[];
  wallets: WalletRow[];
  totalHeld: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<WalletRow | null>(null);
  const [mode, setMode] = useState("CREDIT");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  async function settle(row: WithdrawalRow, status: "PAID" | "REJECTED") {
    setBusy(row.id);
    try {
      const res = await api.patch<{ message: string }>(`/api/admin/wallets/${row.id}`, {
        status,
        adminNote: notes[row.id]?.trim() || undefined,
      });
      toast.success(res.message);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't do that.");
    } finally {
      setBusy(null);
    }
  }

  async function adjust() {
    if (!editing) return;
    setBusy(editing.userId);
    try {
      const res = await api.post<{ message: string }>(`/api/admin/wallets/${editing.userId}`, {
        mode,
        amount: Number(amount) || 0,
        reason: reason.trim() || undefined,
      });
      toast.success(res.message);
      setEditing(null);
      setAmount("");
      setReason("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update that balance.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wallets"
        description={`${rupees(totalHeld)} held across learner wallets. Refer-and-earn pays in here.`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Withdrawal requests</CardTitle>
          <CardDescription>
            Pay the learner, then mark it paid. Declining puts the money back in their wallet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pending.length === 0 ? (
            <EmptyState
              icon={BadgeIndianRupee}
              title="Nothing waiting"
              description="Requests from learners land here."
              className="border-0 bg-transparent py-6"
            />
          ) : (
            pending.map((row) => (
              <div key={row.id} className="space-y-2 rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {rupees(row.amount)} · {row.userName}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {row.userEmail} · {new Date(row.at).toLocaleString("en-IN")}
                    </p>
                  </div>
                  <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                    Waiting
                  </Badge>
                </div>
                {row.payoutNote && (
                  <p className="bg-muted/40 rounded-lg p-2.5 text-xs">Pay to: {row.payoutNote}</p>
                )}
                <Input
                  value={notes[row.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                  placeholder="Reference for the learner (optional)"
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy === row.id} onClick={() => settle(row, "PAID")}>
                    {busy === row.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    Mark as paid
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === row.id}
                    onClick={() => settle(row, "REJECTED")}
                  >
                    <X className="size-4" /> Decline
                  </Button>
                </div>
              </div>
            ))
          )}

          {settled.length > 0 && (
            <div className="space-y-1.5 border-t pt-4">
              <p className="text-sm font-medium">Recently settled</p>
              {settled.map((row) => (
                <p key={row.id} className="text-muted-foreground text-xs">
                  {rupees(row.amount)} · {row.userName} ·{" "}
                  {row.status === "PAID" ? "paid" : "declined"}
                  {row.processedAt ? ` · ${new Date(row.processedAt).toLocaleDateString("en-IN")}` : ""}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Balances</CardTitle>
          <CardDescription>The fullest wallets first. Any balance can be put right here.</CardDescription>
        </CardHeader>
        <CardContent>
          {wallets.length === 0 ? (
            <EmptyState
              icon={WalletIcon}
              title="No wallets yet"
              description="A wallet is made the first time a learner earns or is credited."
              className="border-0 bg-transparent py-6"
            />
          ) : (
            <ul className="divide-y">
              {wallets.map((w) => (
                <li key={w.userId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{w.name}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {w.email}
                      {w.referralCode ? ` · ${w.referralCode}` : ""}
                      {w.referrals > 0 ? ` · ${w.referrals} referred` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums">{rupees(w.balance)}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(w);
                        setMode("CREDIT");
                        setAmount("");
                        setReason("");
                      }}
                    >
                      Adjust
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {editing && (
            <div className="mt-4 space-y-3 rounded-xl border p-4">
              <p className="text-sm font-medium">
                {editing.name} · {rupees(editing.balance)}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>What to do</Label>
                  <Select value={mode} onValueChange={(v) => v && setMode(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v) => MODES.find((m) => m.value === v)?.label ?? "Add to balance"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {MODES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="adj-amount">Amount</Label>
                  <Input
                    id="adj-amount"
                    type="number"
                    min={0}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={mode === "SET" ? "0 to empty the wallet" : "0"}
                  />
                </div>
              </div>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why (the learner sees this)"
              />
              <div className="flex gap-2">
                <Button size="sm" disabled={busy === editing.userId} onClick={adjust}>
                  {busy === editing.userId && <Loader2 className="size-4 animate-spin" />}
                  Save balance
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
