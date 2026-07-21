"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { format } from "date-fns";
import {
  Plus,
  Search,
  Ticket,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Power,
  PowerOff,
  BadgePercent,
  Megaphone,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { COUPON_TYPES, COUPON_TYPE_LABELS, type CouponType } from "@/lib/validations/coupon";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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

interface CouponRow {
  id: string;
  code: string;
  type: string;
  value: number;
  maxDiscount: number | null;
  minAmount: number | null;
  maxUses: number | null;
  usedCount: number;
  courseId: string | null;
  courseTitle: string | null;
  isActive: boolean;
  isExpired: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  showInBanner: boolean;
  bannerText: string | null;
}
interface Stats {
  total: number;
  active: number;
  redemptions: number;
}
interface Query {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
}
interface CourseOpt {
  id: string;
  title: string;
}

const ALL = "all";
const NONE = "none";
const blankForm = {
  code: "",
  type: "PERCENTAGE" as CouponType,
  value: "",
  maxDiscount: "",
  minAmount: "",
  maxUses: "",
  courseId: "",
  isActive: true,
  startsAt: "",
  expiresAt: "",
  showInBanner: false,
  bannerText: "",
};
type FormState = typeof blankForm;

function discountLabel(c: CouponRow): string {
  return c.type === "PERCENTAGE" ? `${c.value}% off` : `₹${c.value.toLocaleString("en-IN")} off`;
}

export function CouponsClient({
  coupons,
  total,
  query,
  stats,
  courses,
}: {
  coupons: CouponRow[];
  total: number;
  query: Query;
  stats: Stats;
  courses: CourseOpt[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(query.search ?? "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CouponRow | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<CouponRow | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const hasFilters = Boolean(query.search || query.status);

  const setParams = useCallback(
    (next: Record<string, string | number | undefined>) => {
      const merged = { search: query.search, status: query.status, page: query.page, ...next };
      const p = new URLSearchParams();
      if (merged.search) p.set("search", String(merged.search));
      if (merged.status) p.set("status", String(merged.status));
      if (merged.page && Number(merged.page) > 1) p.set("page", String(merged.page));
      const qs = p.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, query],
  );

  function openCreate() {
    setEditing(null);
    setForm(blankForm);
    setDialogOpen(true);
  }
  function openEdit(c: CouponRow) {
    setEditing(c);
    setForm({
      code: c.code,
      type: c.type as CouponType,
      value: String(c.value),
      maxDiscount: c.maxDiscount != null ? String(c.maxDiscount) : "",
      minAmount: c.minAmount != null ? String(c.minAmount) : "",
      maxUses: c.maxUses != null ? String(c.maxUses) : "",
      courseId: c.courseId ?? "",
      isActive: c.isActive,
      startsAt: c.startsAt ? c.startsAt.slice(0, 10) : "",
      expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : "",
      showInBanner: c.showInBanner,
      bannerText: c.bannerText ?? "",
    });
    setDialogOpen(true);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      code: form.code,
      type: form.type,
      value: Number(form.value),
      maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : undefined,
      minAmount: form.minAmount ? Number(form.minAmount) : undefined,
      maxUses: form.maxUses ? Number(form.maxUses) : undefined,
      courseId: form.courseId || undefined,
      isActive: form.isActive,
      startsAt: form.startsAt || undefined,
      expiresAt: form.expiresAt || undefined,
      showInBanner: form.showInBanner,
      bannerText: form.bannerText || undefined,
    };
    try {
      if (editing) await api.patch(`/api/coupons/${editing.id}`, payload);
      else await api.post("/api/coupons", payload);
      toast.success(editing ? "Coupon saved." : "Coupon created.");
      setDialogOpen(false);
      router.refresh();
    } catch (err) {
      const d = err instanceof ApiError ? (err.details as { issues?: { message: string }[] }) : undefined;
      toast.error(d?.issues?.[0]?.message ?? (err instanceof ApiError ? err.message : "Couldn't save."));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(c: CouponRow) {
    try {
      await api.post(`/api/coupons/${c.id}/active`, { isActive: !c.isActive });
      toast.success(c.isActive ? "Deactivated." : "Activated.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed.");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/coupons/${deleting.id}`);
      toast.success("Coupon deleted.");
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  const statCards = [
    { label: "Coupons", value: stats.total, icon: Ticket, tone: "text-rose-500" },
    { label: "Active", value: stats.active, icon: Power, tone: "text-emerald-500" },
    { label: "Redemptions", value: stats.redemptions, icon: BadgePercent, tone: "text-violet-500" },
  ];

  function statusBadge(c: CouponRow) {
    if (c.isExpired) return <Badge variant="secondary" className="bg-muted text-muted-foreground">Expired</Badge>;
    return c.isActive ? (
      <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
        Active
      </Badge>
    ) : (
      <Badge variant="secondary" className="bg-muted text-muted-foreground">Inactive</Badge>
    );
  }

  function rowActions(c: CouponRow) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />} aria-label="Actions">
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => openEdit(c)}>
            <Pencil className="size-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toggle(c)}>
            {c.isActive ? <PowerOff className="size-4" /> : <Power className="size-4" />}
            {c.isActive ? "Deactivate" : "Activate"}
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleting(c)}>
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const columns: Column<CouponRow>[] = [
    {
      key: "code",
      header: "Code",
      cell: (c) => (
        <div className="min-w-0">
          <span className="flex items-center gap-1.5">
            <button type="button" onClick={() => openEdit(c)} className="hover:text-primary font-mono font-semibold">
              {c.code}
            </button>
            {c.showInBanner && (
              <Badge
                variant="secondary"
                className="bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
              >
                <Megaphone className="size-3" /> Banner
              </Badge>
            )}
          </span>
          <p className="text-muted-foreground truncate text-xs">
            {c.courseTitle ? c.courseTitle : "All courses"}
          </p>
        </div>
      ),
    },
    { key: "discount", header: "Discount", cell: (c) => <span className="text-sm font-medium">{discountLabel(c)}</span> },
    {
      key: "usage",
      header: "Used",
      className: "tabular-nums",
      cell: (c) => (
        <span className="text-sm">
          {c.usedCount}
          {c.maxUses != null ? ` / ${c.maxUses}` : ""}
        </span>
      ),
    },
    {
      key: "expiry",
      header: "Expires",
      cell: (c) => (
        <span className="text-muted-foreground text-sm whitespace-nowrap">
          {c.expiresAt ? format(new Date(c.expiresAt), "d MMM yyyy") : "—"}
        </span>
      ),
    },
    { key: "status", header: "Status", cell: statusBadge },
    { key: "actions", header: <span className="sr-only">Actions</span>, headerClassName: "w-10", cell: rowActions },
  ];

  function renderCard(c: CouponRow) {
    return (
      <div className="rounded-xl border p-4">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={() => openEdit(c)} className="min-w-0 text-left">
            <p className="font-mono font-semibold">{c.code}</p>
            <p className="text-muted-foreground truncate text-xs">{c.courseTitle ?? "All courses"}</p>
          </button>
          {rowActions(c)}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary">{discountLabel(c)}</Badge>
          {statusBadge(c)}
          <span className="text-muted-foreground">
            Used {c.usedCount}
            {c.maxUses != null ? `/${c.maxUses}` : ""}
          </span>
        </div>
      </div>
    );
  }

  const canSave = form.code.trim().length >= 3 && Number(form.value) > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coupons"
        description="Discount codes for the website and admin-created payments."
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" /> New coupon
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="bg-muted grid size-10 shrink-0 place-items-center rounded-lg">
                <s.icon className={`size-5 ${s.tone}`} />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-semibold leading-none tabular-nums">{s.value}</p>
                <p className="text-muted-foreground mt-1 truncate text-xs">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataTable
        data={coupons}
        columns={columns}
        rowKey={(c) => c.id}
        renderCard={renderCard}
        emptyIcon={Ticket}
        emptyTitle="No coupons yet"
        emptyDescription="Create a discount code to offer on the website or in payments."
        toolbar={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <form onSubmit={(e) => { e.preventDefault(); setParams({ search: search || undefined, page: 1 }); }} className="relative flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code…" className="pl-9" />
            </form>
            <Select value={query.status ?? ALL} onValueChange={(v) => setParams({ status: !v || v === ALL ? undefined : v, page: 1 })}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue>{(v) => (!v || v === ALL ? "All statuses" : v === "ACTIVE" ? "Active" : v === "INACTIVE" ? "Inactive" : "Expired")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" onClick={() => { setSearch(""); setParams({ search: undefined, status: undefined, page: 1 }); }}>
                Clear
              </Button>
            )}
          </div>
        }
        footer={
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">{total} coupons</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={query.page <= 1} onClick={() => setParams({ page: query.page - 1 })}>Previous</Button>
              <span className="text-muted-foreground text-sm">Page {query.page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={query.page >= totalPages} onClick={() => setParams({ page: query.page + 1 })}>Next</Button>
            </div>
          </div>
        }
      />

      {/* Create / edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit coupon" : "New coupon"}</DialogTitle>
            <DialogDescription>Set the discount, limits and validity.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-code">Code</Label>
                <Input id="c-code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="WELCOME20" className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: (v as CouponType) ?? "PERCENTAGE" }))}>
                  <SelectTrigger className="w-full"><SelectValue>{(v) => COUPON_TYPE_LABELS[(v as CouponType) ?? "PERCENTAGE"]}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {COUPON_TYPES.map((t) => <SelectItem key={t} value={t}>{COUPON_TYPE_LABELS[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-value">{form.type === "PERCENTAGE" ? "Percent off" : "Amount off (₹)"}</Label>
                <Input id="c-value" type="number" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} placeholder={form.type === "PERCENTAGE" ? "20" : "500"} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-maxdisc">Max discount ₹ (optional)</Label>
                <Input id="c-maxdisc" type="number" value={form.maxDiscount} onChange={(e) => setForm((f) => ({ ...f, maxDiscount: e.target.value }))} placeholder="e.g. 2000" disabled={form.type === "FIXED"} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-min">Min order ₹ (optional)</Label>
                <Input id="c-min" type="number" value={form.minAmount} onChange={(e) => setForm((f) => ({ ...f, minAmount: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-uses">Max uses (optional)</Label>
                <Input id="c-uses" type="number" value={form.maxUses} onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} placeholder="Unlimited" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Applies to</Label>
              <Select value={form.courseId || NONE} onValueChange={(v) => setForm((f) => ({ ...f, courseId: v === NONE ? "" : (v ?? "") }))}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v) => (!v || v === NONE ? "All courses" : (courses.find((c) => c.id === v)?.title ?? "Course"))}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>All courses</SelectItem>
                  {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-start">Starts (optional)</Label>
                <Input id="c-start" type="date" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-exp">Expires (optional)</Label>
                <Input id="c-exp" type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-muted-foreground text-xs">Inactive coupons can&apos;t be redeemed.</p>
              </div>
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
            </div>

            {/* Promotion — what the public announcement bar shows. */}
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Show in site banner</p>
                  <p className="text-muted-foreground text-xs">
                    Advertises this code in the strip at the top of the public site, until it
                    expires or is used up.
                  </p>
                </div>
                <Switch
                  checked={form.showInBanner}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, showInBanner: v }))}
                />
              </div>

              {form.showInBanner && (
                <div className="space-y-1.5">
                  <Label htmlFor="c-banner">Banner headline (optional)</Label>
                  <Input
                    id="c-banner"
                    value={form.bannerText}
                    onChange={(e) => setForm((f) => ({ ...f, bannerText: e.target.value }))}
                    placeholder="New year, new skills"
                    maxLength={120}
                  />
                  <p className="text-muted-foreground text-xs">
                    Shown before the discount, e.g. &ldquo;New year, new skills —{" "}
                    {form.type === "PERCENTAGE"
                      ? `${form.value || "40"}% off`
                      : `₹${form.value || "500"} off`}
                    &rdquo;. Leave empty for a default line.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !canSave}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {editing ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete coupon {deleting?.code}?</AlertDialogTitle>
            <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
