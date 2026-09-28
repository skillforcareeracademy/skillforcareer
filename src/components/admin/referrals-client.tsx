"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  BadgeIndianRupee,
  Check,
  Gift,
  Loader2,
  Share2,
  Trophy,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Row {
  id: string;
  code: string;
  status: string;
  rewardAmount: number;
  at: string;
  referrerName: string;
  referrerEmail: string;
  refereeName: string | null;
  refereeEmail: string | null;
  refereePaid: boolean;
}
interface CodeRow {
  userId: string;
  name: string;
  email: string;
  code: string;
  used: number;
  rewarded: number;
  earned: number;
  balance: number;
}
interface TopReferrer {
  userId: string;
  name: string;
  email: string;
  code: string | null;
  rewarded: number;
  earned: number;
}

const ALL = "all";
const STATUSES = [
  { value: "PENDING", label: "Waiting on a payment" },
  { value: "REWARDED", label: "Paid" },
  { value: "EXPIRED", label: "Closed" },
];
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * The Referral System, in one place: how the programme is set, what it has
 * paid, who is bringing people in, and every referral with where it stands.
 *
 * The academy asked for this as its own option rather than a corner of
 * Settings — refer-and-earn is money going out, and it is watched like it.
 */
export function ReferralsClient({
  enabled,
  reward,
  discount,
  birthdayReward,
  withdrawalsEnabled,
  minWithdrawal,
  stats,
  rows,
  topReferrers,
  total,
  page,
  pageSize,
  status,
  search,
  codes,
  codesTotal,
  codePage,
  codeSearch,
  learners,
}: {
  enabled: boolean;
  reward: number;
  /** What the referred friend gets off their first course. */
  discount: number;
  /** What a referral on the birthday code pays. */
  birthdayReward: number;
  withdrawalsEnabled: boolean;
  minWithdrawal: number;
  stats: {
    total: number;
    pending: number;
    rewarded: number;
    paidOut: number;
    heldInWallets: number;
    withdrawalsWaiting: number;
  };
  rows: Row[];
  topReferrers: TopReferrer[];
  total: number;
  page: number;
  pageSize: number;
  status?: string;
  search?: string;
  codes: CodeRow[];
  codesTotal: number;
  codePage: number;
  codeSearch?: string;
  learners: { id: string; name: string; email: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [form, setForm] = useState({
    referralEnabled: enabled,
    referralRewardAmount: String(reward),
    referralDiscountAmount: String(discount),
    birthdayReferralReward: String(birthdayReward),
    walletWithdrawalsEnabled: withdrawalsEnabled,
    walletMinWithdrawal: String(minWithdrawal),
  });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState(search ?? "");
  const [codeQuery, setCodeQuery] = useState(codeSearch ?? "");
  const [newCodeFor, setNewCodeFor] = useState("");
  const [newCode, setNewCode] = useState("");
  const [creating, setCreating] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function setParams(next: Record<string, string | number | undefined>) {
    const merged = { status, search, page, codeSearch, codePage, ...next };
    const p = new URLSearchParams();
    if (merged.status) p.set("status", String(merged.status));
    if (merged.search) p.set("search", String(merged.search));
    if (merged.page && Number(merged.page) > 1) p.set("page", String(merged.page));
    if (merged.codeSearch) p.set("codeSearch", String(merged.codeSearch));
    if (merged.codePage && Number(merged.codePage) > 1) p.set("codePage", String(merged.codePage));
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const res = await api.patch<{ message: string }>("/api/admin/referrals", {
        referralEnabled: form.referralEnabled,
        referralRewardAmount: Number(form.referralRewardAmount) || 0,
        referralDiscountAmount: Number(form.referralDiscountAmount) || 0,
        birthdayReferralReward: Number(form.birthdayReferralReward) || 0,
        walletWithdrawalsEnabled: form.walletWithdrawalsEnabled,
        walletMinWithdrawal: Number(form.walletMinWithdrawal) || 0,
      });
      toast.success(res.message);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  async function createCode() {
    if (!newCodeFor) return;
    setCreating(true);
    try {
      const res = await api.post<{ code: string; message: string }>(
        "/api/admin/referrals/codes",
        { userId: newCodeFor, code: newCode.trim() || undefined },
      );
      toast.success(res.message);
      setNewCode("");
      setNewCodeFor("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't create that code.");
    } finally {
      setCreating(false);
    }
  }

  async function act(row: Row, action: "PAY" | "CANCEL") {
    setBusy(row.id);
    try {
      const res = await api.patch<{ message: string }>(`/api/admin/referrals/${row.id}`, { action });
      toast.success(res.message);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't do that.");
    } finally {
      setBusy(null);
    }
  }

  function statusBadge(row: Row) {
    if (row.status === "REWARDED") {
      return (
        <Badge variant="secondary" className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          <Check className="size-3" /> Paid {rupees(row.rewardAmount)}
        </Badge>
      );
    }
    if (row.status === "EXPIRED") {
      return (
        <Badge variant="secondary" className="bg-muted text-muted-foreground gap-1">
          <X className="size-3" /> Closed
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
        {row.refereePaid ? "Payment seen — not yet paid out" : "Waiting on their payment"}
      </Badge>
    );
  }

  const cards = [
    { label: "Referrals", value: String(stats.total), icon: Share2, tone: "text-sky-500" },
    { label: "Paid out", value: rupees(stats.paidOut), icon: BadgeIndianRupee, tone: "text-emerald-500" },
    { label: "Held in wallets", value: rupees(stats.heldInWallets), icon: Wallet, tone: "text-violet-500" },
    {
      label: "Withdrawals waiting",
      value: String(stats.withdrawalsWaiting),
      icon: Users,
      tone: "text-amber-500",
    },
  ];

  const columns: Column<Row>[] = [
    {
      key: "referrer",
      header: "Referrer",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.referrerName}</p>
          <p className="text-muted-foreground truncate text-xs">{r.referrerEmail}</p>
        </div>
      ),
    },
    {
      key: "referee",
      header: "Who they brought",
      cell: (r) =>
        r.refereeName ? (
          <div className="min-w-0">
            <p className="truncate text-sm">{r.refereeName}</p>
            <p className="text-muted-foreground truncate text-xs">{r.refereeEmail}</p>
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">Not used yet</span>
        ),
    },
    {
      key: "code",
      header: "Code",
      cell: (r) => <code className="bg-muted rounded px-1.5 py-0.5 text-xs">{r.code}</code>,
    },
    {
      key: "at",
      header: "Raised",
      cell: (r) => (
        <span className="text-muted-foreground text-xs">
          {new Date(r.at).toLocaleDateString("en-IN")}
        </span>
      ),
    },
    { key: "status", header: "Status", cell: statusBadge },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "w-40",
      cell: (r) =>
        r.status === "REWARDED" ? null : (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => act(r, "PAY")}>
              {busy === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <Gift className="size-3.5" />}
              Pay
            </Button>
            {r.status !== "EXPIRED" && (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                disabled={busy === r.id}
                onClick={() => act(r, "CANCEL")}
              >
                Close
              </Button>
            )}
          </div>
        ),
    },
  ];

  function renderCard(r: Row) {
    return (
      <div className="space-y-2 rounded-xl border p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{r.referrerName}</p>
            <p className="text-muted-foreground truncate text-xs">
              {r.refereeName ?? "Not used yet"} · {r.code}
            </p>
          </div>
          {statusBadge(r)}
        </div>
        {r.status !== "REWARDED" && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => act(r, "PAY")}>
              <Gift className="size-3.5" /> Pay
            </Button>
            {r.status !== "EXPIRED" && (
              <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => act(r, "CANCEL")}>
                Close
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Referral System"
        description="Refer and earn: what a learner gets for bringing a friend, and every referral the academy has seen."
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/admin/wallets" />}>
            <Wallet className="size-4" /> Wallets &amp; payouts
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="bg-muted grid size-10 shrink-0 place-items-center rounded-lg">
                <c.icon className={`size-5 ${c.tone}`} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-2xl leading-none font-semibold tabular-nums">{c.value}</p>
                <p className="text-muted-foreground mt-1 truncate text-xs">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* How the programme is set */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>How the programme works</CardTitle>
            <CardDescription>
              These are the rules every learner sees on their wallet page and in their birthday
              voucher.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>
                Refer and earn is on
                <span className="text-muted-foreground block text-xs">
                  Off hides the codes and pays nothing out. Referrals already paid are untouched.
                </span>
              </span>
              <Switch
                checked={form.referralEnabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, referralEnabled: v }))}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="r-reward">Reward per enrolment (₹)</Label>
                <Input
                  id="r-reward"
                  type="number"
                  min={0}
                  value={form.referralRewardAmount}
                  onChange={(e) => setForm((f) => ({ ...f, referralRewardAmount: e.target.value }))}
                />
                <p className="text-muted-foreground text-xs">
                  Paid into the referrer&apos;s wallet when the person they referred pays for a seat.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-discount">Discount for the friend (₹)</Label>
                <Input
                  id="r-discount"
                  type="number"
                  min={0}
                  value={form.referralDiscountAmount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, referralDiscountAmount: e.target.value }))
                  }
                />
                <p className="text-muted-foreground text-xs">
                  Taken off the first course the referred friend buys. 0 = no discount.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-birthday">Birthday code reward (₹)</Label>
                <Input
                  id="r-birthday"
                  type="number"
                  min={0}
                  value={form.birthdayReferralReward}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, birthdayReferralReward: e.target.value }))
                  }
                />
                <p className="text-muted-foreground text-xs">
                  A different code, issued on the learner&apos;s birthday and good for that day
                  only. 0 = no birthday code.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-min">Smallest withdrawal (₹)</Label>
                <Input
                  id="r-min"
                  type="number"
                  min={0}
                  value={form.walletMinWithdrawal}
                  onChange={(e) => setForm((f) => ({ ...f, walletMinWithdrawal: e.target.value }))}
                />
                <p className="text-muted-foreground text-xs">0 lets them ask for any amount.</p>
              </div>
            </div>
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>Learners may ask for a payout</span>
              <Switch
                checked={form.walletWithdrawalsEnabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, walletWithdrawalsEnabled: v }))}
              />
            </label>
            <Button onClick={saveSettings} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save settings
            </Button>
          </CardContent>
        </Card>

        {/* Who is bringing people in */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="size-4" /> Top referrers
            </CardTitle>
            <CardDescription>By referrals that have paid out.</CardDescription>
          </CardHeader>
          <CardContent>
            {topReferrers.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nobody has earned yet.</p>
            ) : (
              <ul className="space-y-3">
                {topReferrers.map((t, i) => (
                  <li key={t.userId} className="flex items-center gap-3">
                    <span className="bg-muted grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.name}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {t.rewarded} referral{t.rewarded === 1 ? "" : "s"}
                        {t.code ? ` · ${t.code}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {rupees(t.earned)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Codes: who has one, how often it has been used, and what it has earned
          them — the academy's "referral codes used status in admin". A code can
          also be handed out from here. */}
      <Card>
        <CardHeader>
          <CardTitle>Codes and earnings</CardTitle>
          <CardDescription>
            Every code the academy has given out, how many people have used it, and what it has
            paid the learner who owns it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="code-for">Create a code for</Label>
              <Select value={newCodeFor} onValueChange={(v) => setNewCodeFor(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a learner">
                    {(v) => {
                      const person = learners.find((l) => l.id === v);
                      return person ? `${person.name} · ${person.email}` : "Choose a learner";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {learners.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name} · {l.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="code-value">Code (optional)</Label>
              <Input
                id="code-value"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder="Leave blank to generate one"
                maxLength={20}
              />
            </div>
            <Button onClick={createCode} disabled={creating || !newCodeFor}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Gift className="size-4" />}
              Create code
            </Button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setParams({ codeSearch: codeQuery || undefined, codePage: 1 });
            }}
            className="sm:max-w-xs"
          >
            <Input
              placeholder="Search a learner or a code…"
              value={codeQuery}
              onChange={(e) => setCodeQuery(e.target.value)}
            />
          </form>

          {codes.length === 0 ? (
            <p className="text-muted-foreground text-sm">No codes yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-left text-xs">
                  <tr className="border-b">
                    <th className="py-2 pr-3 font-medium">Learner</th>
                    <th className="py-2 pr-3 font-medium">Code</th>
                    <th className="py-2 pr-3 text-right font-medium">Used</th>
                    <th className="py-2 pr-3 text-right font-medium">Paid out</th>
                    <th className="py-2 pr-3 text-right font-medium">Earned</th>
                    <th className="py-2 text-right font-medium">Wallet</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((c) => (
                    <tr key={c.userId} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <p className="font-medium">{c.name}</p>
                        <p className="text-muted-foreground text-xs">{c.email}</p>
                      </td>
                      <td className="py-2 pr-3">
                        <code className="bg-muted rounded px-1.5 py-0.5 text-xs">{c.code}</code>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{c.used}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{c.rewarded}</td>
                      <td className="py-2 pr-3 text-right font-medium tabular-nums">
                        {rupees(c.earned)}
                      </td>
                      <td className="py-2 text-right tabular-nums">{rupees(c.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {codesTotal > 10 && (
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">{codesTotal} codes</p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={codePage <= 1}
                  onClick={() => setParams({ codePage: codePage - 1 })}
                >
                  Previous
                </Button>
                <span className="text-muted-foreground text-sm">
                  Page {codePage} of {Math.max(1, Math.ceil(codesTotal / 10))}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={codePage >= Math.ceil(codesTotal / 10)}
                  onClick={() => setParams({ codePage: codePage + 1 })}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        renderCard={renderCard}
        emptyIcon={Share2}
        emptyTitle="No referrals yet"
        emptyDescription="When a learner signs up with somebody's code, it appears here."
        toolbar={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setParams({ search: query || undefined, page: 1 });
              }}
              className="flex-1 sm:max-w-xs"
            >
              <Input
                placeholder="Search a name, email or code…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </form>
            <Select
              value={status ?? ALL}
              onValueChange={(v) => setParams({ status: !v || v === ALL ? undefined : v, page: 1 })}
            >
              <SelectTrigger className="sm:w-56">
                <SelectValue>
                  {(v) =>
                    !v || v === ALL
                      ? "All referrals"
                      : (STATUSES.find((s) => s.value === v)?.label ?? "Status")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All referrals</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        footer={
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              {total} referral{total === 1 ? "" : "s"} · {stats.pending} waiting
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setParams({ page: page - 1 })}
              >
                Previous
              </Button>
              <span className="text-muted-foreground text-sm">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setParams({ page: page + 1 })}
              >
                Next
              </Button>
            </div>
          </div>
        }
      />
    </div>
  );
}
