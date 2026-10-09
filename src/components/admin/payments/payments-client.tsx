"use client";

import { useCallback, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { format } from "date-fns";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Loader2,
  Pencil,
  IndianRupee,
  Receipt,
  CircleCheckBig,
  Undo2,
  Eye,
  X,
  Landmark,
  Scale,
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
  joinPlan,
} from "@/lib/validations/payment";
import { PaymentAccountsDialog } from "@/components/admin/payments/payment-accounts-dialog";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { BulkFeeTermsDialog } from "./bulk-fee-terms-dialog";
import { StatCards, type StatCard } from "@/components/shared/stat-cards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  PaymentFormDialog,
  type PaymentFormInitial,
} from "@/components/admin/payments/payment-form-dialog";
import type { PaymentDetail } from "@/components/admin/payments/types";

interface PaymentRow {
  id: string;
  invoiceNumber: string;
  studentName: string;
  studentEmail: string;
  studentAvatar: string | null;
  courseId: string | null;
  courseTitle: string | null;
  /** What a payment with no course behind it was for, e.g. watermark removal. */
  purpose: string | null;
  netAmount: number;
  currency: string;
  status: string;
  provider: string;
  method: string | null;
  accountName: string | null;
  createdAt: string;
  paidAt: string | null;
  amount: number;
  discountAmount: number;
  type: string;
  emiPlan: string | null;
  /** What this plan still owes, late fees included. */
  outstanding: number;
  penalty: number;
  nextDueDate: string | null;
  daysLate: number;
  installmentCount: number;
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
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function PaymentsClient({
  payments,
  total,
  query,
  stats,
  users,
  courses,
  accounts,
  batches,
}: {
  payments: PaymentRow[];
  total: number;
  query: Query;
  stats: Stats;
  users: UserOpt[];
  courses: CourseOpt[];
  accounts: AccountOpt[];
  batches: { id: string; title: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(query.search ?? "");
  const [accountsOpen, setAccountsOpen] = useState(false);
  /** "Apply fee terms" across everyone, a batch or a course. */
  const [termsOpen, setTermsOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentFormInitial | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PaymentRow | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const hasFilters = Boolean(
    query.search ||
    query.courseId ||
    query.status ||
    query.provider ||
    query.method,
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
      if (merged.page && Number(merged.page) > 1)
        p.set("page", String(merged.page));
      const qs = p.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, query],
  );

  function clearFilters() {
    setSearch("");
    setParams({
      search: undefined,
      course: undefined,
      status: undefined,
      provider: undefined,
      method: undefined,
      page: 1,
    });
  }
  /**
   * Open a row for editing — "bahar se click krke field edit ka option".
   *
   * The list row carries only what the table shows, so the plan and its terms
   * are fetched before the dialog opens rather than arriving a moment later
   * into boxes the office has already started typing in.
   */
  async function openEdit(p: PaymentRow) {
    setOpening(p.id);
    try {
      const d = await api.get<PaymentDetail>(`/api/payments/${p.id}`);
      setEditing({
        id: d.id,
        userId: d.userId,
        courseId: d.courseId,
        amount: d.amount,
        discountAmount: d.discountAmount,
        bookingAmount: d.bookingAmount,
        bookingAt: d.bookingAt,
        status: d.status,
        method: d.method,
        accountId: null,
        paidAt: d.paidAt,
        plan: joinPlan(d.type, d.emiPlan),
        interestPercent: d.interestPercent,
        installments: d.installments.map((i) => ({
          amount: i.amount,
          dueDate: i.dueDate,
        })),
        graceDays: d.graceDays,
        penaltyPercent: d.penaltyPercent,
        penaltyFlat: d.penaltyFlat,
        penaltyWaived: d.penaltyWaived,
        firstPaymentAt: d.firstPaymentAt,
        lastPaymentAt: d.lastPaymentAt,
        notes: d.notes,
      });
      setFormOpen(true);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Couldn't open that payment.",
      );
    } finally {
      setOpening(null);
    }
  }

  async function sendReminder(p: PaymentRow) {
    try {
      const res = await api.post<{ message: string }>(
        `/api/payments/${p.id}/remind`,
      );
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

  const statCards: StatCard[] = [
    {
      label: "Revenue",
      value: inr(stats.revenue),
      icon: IndianRupee,
      tone: "text-emerald-500",
    },
    {
      label: "Transactions",
      value: String(stats.transactions),
      icon: Receipt,
      tone: "text-rose-500",
      hint: "Every payment. Tap to clear the filters.",
      active: !hasFilters,
      onClick: () =>
        setParams({
          status: undefined,
          course: undefined,
          provider: undefined,
          method: undefined,
          search: undefined,
          page: 1,
        }),
    },
    {
      label: "Paid",
      value: String(stats.paid),
      icon: CircleCheckBig,
      tone: "text-sky-500",
      hint: "Payments that went through.",
      active: query.status === "PAID",
      onClick: () =>
        setParams({
          status: query.status === "PAID" ? undefined : "PAID",
          page: 1,
        }),
    },
    {
      label: "Refunded",
      value: String(stats.refunded),
      icon: Undo2,
      tone: "text-violet-500",
      hint: "Payments sent back.",
      active: query.status === "REFUNDED",
      onClick: () =>
        setParams({
          status: query.status === "REFUNDED" ? undefined : "REFUNDED",
          page: 1,
        }),
    },
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
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" />}
          aria-label="Actions"
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDetailId(p.id)}>
            <Eye className="size-4" /> View &amp; refund
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={opening === p.id}
            onClick={() => openEdit(p)}
          >
            {opening === p.id ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Pencil className="size-4" />
            )}
            Edit payment &amp; fees
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
            {p.studentAvatar && (
              <AvatarImage src={p.studentAvatar} alt={p.studentName} />
            )}
            <AvatarFallback className="text-xs">
              {initials(p.studentName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{p.studentName}</p>
            <p className="text-muted-foreground truncate text-xs">
              {p.invoiceNumber}
              {p.courseTitle
                ? ` · ${p.courseTitle}`
                : p.purpose
                  ? ` · ${p.purpose}`
                  : ""}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      className: "tabular-nums font-medium",
      cell: (p) => (
        <div>
          <p>{inr(p.netAmount)}</p>
          {p.outstanding > 0 && (
            <p className="text-muted-foreground text-xs font-normal">
              {inr(p.outstanding)} due
              {p.daysLate > 0 ? ` · ${p.daysLate}d late` : ""}
            </p>
          )}
          {p.installmentCount > 0 && p.outstanding <= 0 && (
            <p className="text-muted-foreground text-xs font-normal">
              {p.installmentCount} instalments · cleared
            </p>
          )}
        </div>
      ),
    },
    {
      key: "due",
      header: "Next due",
      cell: (p) =>
        p.nextDueDate ? (
          <span
            className={
              p.daysLate > 0
                ? "text-sm whitespace-nowrap text-rose-600 dark:text-rose-400"
                : "text-muted-foreground text-sm whitespace-nowrap"
            }
          >
            {format(new Date(p.nextDueDate), "d MMM yyyy")}
            {p.penalty > 0 && (
              <span className="block text-xs">+{inr(p.penalty)} late fee</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        ),
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
            <p className="text-muted-foreground truncate text-xs">
              {p.accountName}
            </p>
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
          <button
            type="button"
            onClick={() => setDetailId(p.id)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <Avatar className="size-9 shrink-0">
              {p.studentAvatar && (
                <AvatarImage src={p.studentAvatar} alt={p.studentName} />
              )}
              <AvatarFallback className="text-xs">
                {initials(p.studentName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">{p.studentName}</p>
              <p className="text-muted-foreground truncate text-xs">
                {p.invoiceNumber}
              </p>
            </div>
          </button>
          {rowActions(p)}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="font-medium tabular-nums">{inr(p.netAmount)}</span>
          {statusBadge(p)}
        </div>
        {p.outstanding > 0 && (
          <p className="text-muted-foreground mt-1 text-xs">
            {inr(p.outstanding)} due
            {p.nextDueDate
              ? ` by ${format(new Date(p.nextDueDate), "d MMM")}`
              : ""}
            {p.daysLate > 0 ? ` · ${p.daysLate} days late` : ""}
          </p>
        )}
      </div>
    );
  }

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
            {/* "Coz for every student we can not add this." */}
            <Button variant="outline" onClick={() => setTermsOpen(true)}>
              <Scale className="size-4" /> Fee terms
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" /> Record payment
            </Button>
          </div>
        }
      />

      {/* Summary */}
      <StatCards
        cards={statCards}
        className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
      />

      <DataTable
        columns={columns}
        data={payments}
        rowKey={(p) => p.id}
        renderCard={renderCard}
        emptyIcon={Receipt}
        emptyTitle={hasFilters ? "No matching payments" : "No payments yet"}
        emptyDescription={
          hasFilters
            ? "Try adjusting your search or filters."
            : "Record your first payment to get started."
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
                onValueChange={(v) =>
                  setParams({
                    status: !v || v === ALL ? undefined : v,
                    page: 1,
                  })
                }
              >
                <SelectTrigger className="w-36">
                  <SelectValue>
                    {(v) =>
                      !v || v === ALL
                        ? "All statuses"
                        : PAYMENT_STATUS_LABEL[String(v)]
                    }
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
                onValueChange={(v) =>
                  setParams({
                    provider: !v || v === ALL ? undefined : v,
                    page: 1,
                  })
                }
              >
                <SelectTrigger className="w-32">
                  <SelectValue>
                    {(v) =>
                      !v || v === ALL
                        ? "Provider"
                        : PAYMENT_PROVIDER_LABEL[String(v)]
                    }
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
                onValueChange={(v) =>
                  setParams({
                    method: !v || v === ALL ? undefined : v,
                    page: 1,
                  })
                }
              >
                <SelectTrigger className="w-32">
                  <SelectValue>
                    {(v) =>
                      !v || v === ALL
                        ? "Method"
                        : PAYMENT_METHOD_LABEL[String(v)]
                    }
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="text-muted-foreground"
                >
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
              <Button
                variant="outline"
                size="sm"
                disabled={query.page <= 1}
                onClick={() => setParams({ page: query.page - 1 })}
              >
                Previous
              </Button>
              <span className="text-muted-foreground text-sm">
                Page {query.page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={query.page >= totalPages}
                onClick={() => setParams({ page: query.page + 1 })}
              >
                Next
              </Button>
            </div>
          </div>
        }
      />

      <PaymentFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
        options={{ users, courses, accounts }}
        initial={editing}
        onSaved={() => router.refresh()}
      />

      <PaymentDetailSheet
        paymentId={detailId}
        onOpenChange={(o) => !o && setDetailId(null)}
      />

      <PaymentAccountsDialog
        open={accountsOpen}
        onOpenChange={setAccountsOpen}
      />

      <BulkFeeTermsDialog
        open={termsOpen}
        onOpenChange={setTermsOpen}
        batches={batches}
        courses={courses.map((c) => ({ id: c.id, title: c.title }))}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete payment {deleting?.invoiceNumber}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the payment and its refunds. This
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
