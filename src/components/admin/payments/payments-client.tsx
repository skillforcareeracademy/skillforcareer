"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { format } from "date-fns";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Loader2,
  IndianRupee,
  Receipt,
  CircleCheckBig,
  Undo2,
  Eye,
  X,
  Landmark,
  BellRing,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import {
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABEL,
  PAYMENT_PROVIDERS,
  PAYMENT_PROVIDER_LABEL,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
} from "@/lib/validations/payment";
import { PaymentAccountsDialog } from "@/components/admin/payments/payment-accounts-dialog";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  PaymentDetailSheet,
  STATUS_BADGE,
} from "@/components/admin/payments/payment-detail-sheet";

interface PaymentRow {
  id: string;
  invoiceNumber: string;
  studentName: string;
  studentEmail: string;
  studentAvatar: string | null;
  courseId: string | null;
  courseTitle: string | null;
  netAmount: number;
  currency: string;
  status: string;
  provider: string;
  method: string | null;
  accountName: string | null;
  createdAt: string;
  paidAt: string | null;
}
interface Stats {
  revenue: number;
  transactions: number;
  paid: number;
  refunded: number;
}
interface Query {
  page: number;
  pageSize: number;
  search?: string;
  courseId?: string;
  status?: string;
  provider?: string;
  method?: string;
}
interface UserOpt {
  id: string;
  name: string;
  email: string;
}
interface CourseOpt {
  id: string;
  title: string;
}
interface AccountOpt {
  id: string;
  name: string;
  kind: string;
  autoReconcile: boolean;
}

const ALL = "all";
const NONE = "none";
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function PaymentsClient({
  payments,
  total,
  query,
  stats,
  users,
  courses,
  accounts,
}: {
  payments: PaymentRow[];
  total: number;
  query: Query;
  stats: Stats;
  users: UserOpt[];
  courses: CourseOpt[];
  accounts: AccountOpt[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(query.search ?? "");
  const [recordOpen, setRecordOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [form, setForm] = useState({
    userId: "",
    courseId: "",
    amount: "",
    status: "PAID",
    provider: "MANUAL",
    method: "UPI",
    accountId: "",
    paidAt: "",
    couponCode: "",
    type: "ONE_TIME",
    installments: "3",
  });
  const [coupon, setCoupon] = useState<{ discount: number; net: number; code: string } | null>(null);
  const [applying, setApplying] = useState(false);

  async function applyCoupon() {
    if (!form.couponCode.trim() || Number(form.amount) < 1) {
      toast.error("Enter an amount and a coupon code.");
      return;
    }
    setApplying(true);
    try {
      const r = await api.post<{ valid: boolean; reason?: string; discount?: number; netAmount?: number; code?: string }>(
        "/api/coupons/validate",
        { code: form.couponCode, amount: Number(form.amount), courseId: form.courseId || undefined },
      );
      if (!r.valid) {
        setCoupon(null);
        toast.error(r.reason ?? "Invalid coupon.");
      } else {
        setCoupon({ discount: r.discount ?? 0, net: r.netAmount ?? Number(form.amount), code: r.code ?? form.couponCode });
        toast.success(`Coupon applied — ₹${(r.discount ?? 0).toLocaleString("en-IN")} off.`);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't validate coupon.");
    } finally {
      setApplying(false);
    }
  }
  const [recording, setRecording] = useState(false);
  const [deleting, setDeleting] = useState<PaymentRow | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const hasFilters = Boolean(
    query.search || query.courseId || query.status || query.provider || query.method,
  );

  const setParams = useCallback(
    (next: Record<string, string | number | undefined>) => {
      const merged = {
        search: query.search,
        course: query.courseId,
        status: query.status,
        provider: query.provider,
        method: query.method,
        page: query.page,
        ...next,
      };
      const p = new URLSearchParams();
      if (merged.search) p.set("search", String(merged.search));
      if (merged.course) p.set("course", String(merged.course));
      if (merged.status) p.set("status", String(merged.status));
      if (merged.provider) p.set("provider", String(merged.provider));
      if (merged.method) p.set("method", String(merged.method));
      if (merged.page && Number(merged.page) > 1) p.set("page", String(merged.page));
      const qs = p.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, query],
  );

  function clearFilters() {
    setSearch("");
    setParams({ search: undefined, course: undefined, status: undefined, provider: undefined, method: undefined, page: 1 });
  }
  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onRecord(e: FormEvent) {
    e.preventDefault();
    setRecording(true);
    const isEmi = form.method === "EMI";
    try {
      await api.post("/api/payments", {
        userId: form.userId,
        courseId: form.courseId || undefined,
        amount: Number(form.amount),
        status: form.status,
        provider: form.method === "ONLINE" ? "RAZORPAY" : "MANUAL",
        method: form.method,
        accountId: form.accountId || undefined,
        paidAt:
          form.status === "PAID" && form.paidAt
            ? new Date(form.paidAt).toISOString()
            : undefined,
        couponCode: coupon ? coupon.code : undefined,
        type: isEmi ? "EMI" : "ONE_TIME",
        installments: isEmi ? Number(form.installments) : undefined,
      });
      toast.success("Payment recorded.");
      setRecordOpen(false);
      setForm({ userId: "", courseId: "", amount: "", status: "PAID", provider: "MANUAL", method: "UPI", accountId: "", paidAt: "", couponCode: "", type: "ONE_TIME", installments: "3" });
      setCoupon(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const d = err.details as { issues?: { message: string }[] } | undefined;
        toast.error(d?.issues?.[0]?.message ?? err.message);
      } else toast.error("Couldn't record payment.");
    } finally {
      setRecording(false);
    }
  }

  async function sendReminder(p: PaymentRow) {
    try {
      const res = await api.post<{ message: string }>(`/api/payments/${p.id}/remind`);
      toast.success(res.message ?? "Reminder sent.");
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.message);
      else toast.error("Couldn't send reminder.");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/payments/${deleting.id}`);
      toast.success("Payment deleted.");
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  const statCards = [
    { label: "Revenue", value: inr(stats.revenue), icon: IndianRupee, tone: "text-emerald-500" },
    { label: "Transactions", value: String(stats.transactions), icon: Receipt, tone: "text-rose-500" },
    { label: "Paid", value: String(stats.paid), icon: CircleCheckBig, tone: "text-sky-500" },
    { label: "Refunded", value: String(stats.refunded), icon: Undo2, tone: "text-violet-500" },
  ];

  function statusBadge(p: PaymentRow) {
    return (
      <Badge variant="secondary" className={STATUS_BADGE[p.status]}>
        {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
      </Badge>
    );
  }

  function rowActions(p: PaymentRow) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />} aria-label="Actions">
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDetailId(p.id)}>
            <Eye className="size-4" /> View &amp; refund
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => sendReminder(p)}>
            <BellRing className="size-4" /> Send reminder
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleting(p)}
          >
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const columns: Column<PaymentRow>[] = [
    {
      key: "student",
      header: "Payment",
      cell: (p) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-8 shrink-0">
            {p.studentAvatar && <AvatarImage src={p.studentAvatar} alt={p.studentName} />}
            <AvatarFallback className="text-xs">{initials(p.studentName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{p.studentName}</p>
            <p className="text-muted-foreground truncate text-xs">
              {p.invoiceNumber}
              {p.courseTitle ? ` · ${p.courseTitle}` : ""}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      className: "tabular-nums font-medium",
      cell: (p) => inr(p.netAmount),
    },
    { key: "status", header: "Status", cell: statusBadge },
    {
      key: "method",
      header: "Method",
      cell: (p) => (
        <div className="text-sm">
          <p>
            {p.method
              ? (PAYMENT_METHOD_LABEL[p.method] ?? p.method)
              : (PAYMENT_PROVIDER_LABEL[p.provider] ?? p.provider)}
          </p>
          {p.accountName && (
            <p className="text-muted-foreground truncate text-xs">{p.accountName}</p>
          )}
        </div>
      ),
    },
    {
      key: "date",
      header: "Date & time",
      cell: (p) => (
        <span className="text-muted-foreground text-sm whitespace-nowrap">
          {format(new Date(p.paidAt ?? p.createdAt), "d MMM yyyy, h:mm a")}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "w-10",
      cell: (p) => rowActions(p),
    },
  ];

  function renderCard(p: PaymentRow) {
    return (
      <div className="rounded-xl border p-4">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={() => setDetailId(p.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <Avatar className="size-9 shrink-0">
              {p.studentAvatar && <AvatarImage src={p.studentAvatar} alt={p.studentName} />}
              <AvatarFallback className="text-xs">{initials(p.studentName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">{p.studentName}</p>
              <p className="text-muted-foreground truncate text-xs">{p.invoiceNumber}</p>
            </div>
          </button>
          {rowActions(p)}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="font-medium tabular-nums">{inr(p.netAmount)}</span>
          {statusBadge(p)}
        </div>
      </div>
    );
  }

  const canRecord = Boolean(form.userId && Number(form.amount) >= 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Track revenue, record payments and manage refunds."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAccountsOpen(true)}>
              <Landmark className="size-4" /> Accounts
            </Button>
            <Button onClick={() => setRecordOpen(true)}>
              <Plus className="size-4" /> Record payment
            </Button>
          </div>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="bg-muted grid size-10 shrink-0 place-items-center rounded-lg">
                <s.icon className={`size-5 ${s.tone}`} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-2xl font-semibold leading-none tabular-nums">{s.value}</p>
                <p className="text-muted-foreground mt-1 truncate text-xs">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={payments}
        rowKey={(p) => p.id}
        renderCard={renderCard}
        emptyIcon={Receipt}
        emptyTitle={hasFilters ? "No matching payments" : "No payments yet"}
        emptyDescription={
          hasFilters ? "Try adjusting your search or filters." : "Record your first payment to get started."
        }
        toolbar={
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setParams({ search: search || undefined, page: 1 });
              }}
              className="flex-1 lg:max-w-xs"
            >
              <Input
                placeholder="Search name or invoice…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </form>
            <div className="flex flex-wrap gap-2">
              <Select
                value={query.status ?? ALL}
                onValueChange={(v) => setParams({ status: !v || v === ALL ? undefined : v, page: 1 })}
              >
                <SelectTrigger className="w-36">
                  <SelectValue>
                    {(v) => (!v || v === ALL ? "All statuses" : PAYMENT_STATUS_LABEL[String(v)])}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {PAYMENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {PAYMENT_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={query.provider ?? ALL}
                onValueChange={(v) => setParams({ provider: !v || v === ALL ? undefined : v, page: 1 })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue>
                    {(v) => (!v || v === ALL ? "Provider" : PAYMENT_PROVIDER_LABEL[String(v)])}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All providers</SelectItem>
                  {PAYMENT_PROVIDERS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {PAYMENT_PROVIDER_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={query.method ?? ALL}
                onValueChange={(v) => setParams({ method: !v || v === ALL ? undefined : v, page: 1 })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue>
                    {(v) => (!v || v === ALL ? "Method" : PAYMENT_METHOD_LABEL[String(v)])}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All methods</SelectItem>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_METHOD_LABEL[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                  <X className="size-4" /> Clear
                </Button>
              )}
            </div>
          </div>
        }
        footer={
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              {total} {total === 1 ? "payment" : "payments"}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={query.page <= 1} onClick={() => setParams({ page: query.page - 1 })}>
                Previous
              </Button>
              <span className="text-muted-foreground text-sm">
                Page {query.page} of {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={query.page >= totalPages} onClick={() => setParams({ page: query.page + 1 })}>
                Next
              </Button>
            </div>
          </div>
        }
      />

      {/* Record dialog */}
      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>Log a payment (e.g. manual / bank transfer) for a learner.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onRecord} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Learner</Label>
              <Select value={form.userId} onValueChange={(v) => set("userId", v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a learner">
                    {(v) => users.find((u) => u.id === v)?.name ?? "Choose a learner"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} · {u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Course (optional)</Label>
              <Select value={form.courseId || NONE} onValueChange={(v) => set("courseId", v === NONE ? "" : (v ?? ""))}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) => (!v || v === NONE ? "None" : (courses.find((c) => c.id === v)?.title ?? "None"))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pay-amt">Amount (₹)</Label>
                <Input
                  id="pay-amt"
                  type="number"
                  min={1}
                  value={form.amount}
                  onChange={(e) => set("amount", e.target.value)}
                  placeholder="e.g. 4999"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => v && set("status", v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => PAYMENT_STATUS_LABEL[String(v)]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_STATUSES.filter((s) => s !== "REFUNDED" && s !== "PARTIALLY_REFUNDED").map((s) => (
                      <SelectItem key={s} value={s}>
                        {PAYMENT_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Payment method</Label>
                <Select value={form.method} onValueChange={(v) => v && set("method", v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => PAYMENT_METHOD_LABEL[String(v)]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PAYMENT_METHOD_LABEL[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Received in</Label>
                <Select value={form.accountId || NONE} onValueChange={(v) => set("accountId", v === NONE ? "" : (v ?? ""))}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) =>
                        !v || v === NONE
                          ? "Not specified"
                          : (accounts.find((a) => a.id === v)?.name ?? "Not specified")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not specified</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                        {a.autoReconcile ? " · auto" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.status === "PAID" && (
              <div className="space-y-1.5">
                <Label htmlFor="pay-date">Payment date &amp; time</Label>
                <Input
                  id="pay-date"
                  type="datetime-local"
                  value={form.paidAt}
                  onChange={(e) => set("paidAt", e.target.value)}
                />
                <p className="text-muted-foreground text-xs">Leave blank to use the current time.</p>
              </div>
            )}

            {/* Coupon */}
            <div className="space-y-1.5">
              <Label htmlFor="pay-coupon">Coupon (optional)</Label>
              <div className="flex gap-2">
                <Input
                  id="pay-coupon"
                  value={form.couponCode}
                  onChange={(e) => {
                    set("couponCode", e.target.value.toUpperCase());
                    setCoupon(null);
                  }}
                  placeholder="Code"
                  className="font-mono"
                />
                <Button type="button" variant="outline" onClick={applyCoupon} disabled={applying || !form.couponCode.trim()}>
                  {applying ? <Loader2 className="size-4 animate-spin" /> : "Apply"}
                </Button>
              </div>
              {coupon && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  −₹{coupon.discount.toLocaleString("en-IN")} · Net payable ₹{coupon.net.toLocaleString("en-IN")}
                </p>
              )}
            </div>

            {/* EMI — shown when the method is EMI */}
            {form.method === "EMI" && (
              <div className="space-y-1.5">
                <Label htmlFor="pay-emi">Installments</Label>
                <Select value={form.installments} onValueChange={(v) => v && set("installments", v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => `${v} months`}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {[2, 3, 4, 6, 9, 12].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} months
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  A monthly installment schedule is generated over the net amount.
                </p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRecordOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canRecord || recording}>
                {recording && <Loader2 className="size-4 animate-spin" />}
                Record
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <PaymentDetailSheet paymentId={detailId} onOpenChange={(o) => !o && setDetailId(null)} />

      <PaymentAccountsDialog open={accountsOpen} onOpenChange={setAccountsOpen} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete payment {deleting?.invoiceNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the payment and its refunds. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
