"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Plus,
  Search,
  Download,
  Target,
  MoreHorizontal,
  Eye,
  Trash2,
  Loader2,
  Phone as PhoneIcon,
  Sparkles,
  UserCheck,
  TrendingUp,
  XCircle,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import {
  LEAD_STATUSES,
  LEAD_SOURCES,
  LEAD_STATUS_LABELS,
  LEAD_SOURCE_LABELS,
  type LeadSource,
} from "@/lib/validations/lead";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { PhoneInput } from "@/components/shared/phone-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { STATUS_BADGE, SOURCE_LABEL } from "@/components/admin/leads/lead-badges";
import { LeadDetailSheet } from "@/components/admin/leads/lead-detail-sheet";

interface LeadRow {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  courseInterest: string | null;
  source: string;
  status: string;
  assignedToName: string | null;
  followUps: number;
  createdAt: string;
}
interface Stats {
  total: number;
  newLeads: number;
  inProgress: number;
  converted: number;
  lost: number;
}
interface Query {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  source?: string;
}

const ALL = "all";
const blankForm = { name: "", phone: "", email: "", courseInterest: "", message: "", source: "MANUAL" as LeadSource };

export function LeadsClient({
  leads,
  total,
  query,
  stats,
  assignees,
}: {
  leads: LeadRow[];
  total: number;
  query: Query;
  stats: Stats;
  assignees: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(query.search ?? "");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<LeadRow | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const hasFilters = Boolean(query.search || query.status || query.source);

  const setParams = useCallback(
    (next: Record<string, string | number | undefined>) => {
      const merged = { search: query.search, status: query.status, source: query.source, page: query.page, ...next };
      const p = new URLSearchParams();
      if (merged.search) p.set("search", String(merged.search));
      if (merged.status) p.set("status", String(merged.status));
      if (merged.source) p.set("source", String(merged.source));
      if (merged.page && Number(merged.page) > 1) p.set("page", String(merged.page));
      const qs = p.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, query],
  );

  const exportHref = (() => {
    const p = new URLSearchParams();
    if (query.search) p.set("search", query.search);
    if (query.status) p.set("status", query.status);
    if (query.source) p.set("source", query.source);
    const qs = p.toString();
    return `/api/leads/export${qs ? `?${qs}` : ""}`;
  })();

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post("/api/leads", {
        name: form.name,
        phone: form.phone,
        email: form.email || undefined,
        courseInterest: form.courseInterest || undefined,
        message: form.message || undefined,
        source: form.source,
      });
      toast.success("Lead added.");
      setCreateOpen(false);
      setForm(blankForm);
      router.refresh();
    } catch (err) {
      const d = err instanceof ApiError ? (err.details as { issues?: { message: string }[] }) : undefined;
      toast.error(d?.issues?.[0]?.message ?? (err instanceof ApiError ? err.message : "Couldn't add lead."));
    } finally {
      setCreating(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/leads/${deleting.id}`);
      toast.success("Lead deleted.");
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  const statCards = [
    { label: "Total leads", value: stats.total, icon: Target, tone: "text-rose-500" },
    { label: "New", value: stats.newLeads, icon: Sparkles, tone: "text-sky-500" },
    { label: "In progress", value: stats.inProgress, icon: UserCheck, tone: "text-amber-500" },
    { label: "Converted", value: stats.converted, icon: TrendingUp, tone: "text-emerald-500" },
    { label: "Lost", value: stats.lost, icon: XCircle, tone: "text-muted-foreground" },
  ];

  function rowActions(l: LeadRow) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />} aria-label="Actions">
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDetailId(l.id)}>
            <Eye className="size-4" /> View &amp; follow up
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleting(l)}>
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const columns: Column<LeadRow>[] = [
    {
      key: "name",
      header: "Lead",
      cell: (l) => (
        <button type="button" onClick={() => setDetailId(l.id)} className="min-w-0 text-left">
          <p className="hover:text-primary truncate font-medium transition-colors">{l.name}</p>
          <p className="text-muted-foreground flex items-center gap-1 truncate text-xs">
            <PhoneIcon className="size-3" /> {l.phone}
          </p>
        </button>
      ),
    },
    {
      key: "interest",
      header: "Interest",
      cell: (l) => <span className="text-sm">{l.courseInterest ?? <span className="text-muted-foreground">—</span>}</span>,
    },
    { key: "source", header: "Source", cell: (l) => <span className="text-sm">{SOURCE_LABEL(l.source)}</span> },
    { key: "status", header: "Status", cell: (l) => STATUS_BADGE(l.status) },
    {
      key: "assigned",
      header: "Assigned",
      cell: (l) => <span className="text-sm">{l.assignedToName ?? <span className="text-muted-foreground">—</span>}</span>,
    },
    {
      key: "created",
      header: "Received",
      cell: (l) => <span className="text-muted-foreground text-sm whitespace-nowrap">{formatDistanceToNow(new Date(l.createdAt), { addSuffix: true })}</span>,
    },
    { key: "actions", header: <span className="sr-only">Actions</span>, headerClassName: "w-10", cell: rowActions },
  ];

  function renderCard(l: LeadRow) {
    return (
      <div className="rounded-xl border p-4">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={() => setDetailId(l.id)} className="min-w-0 text-left">
            <p className="truncate font-medium">{l.name}</p>
            <p className="text-muted-foreground flex items-center gap-1 truncate text-xs">
              <PhoneIcon className="size-3" /> {l.phone}
            </p>
          </button>
          {rowActions(l)}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {STATUS_BADGE(l.status)}
          <span className="text-muted-foreground">{SOURCE_LABEL(l.source)}</span>
          {l.followUps > 0 && (
            <span className="text-muted-foreground flex items-center gap-1">
              <MessageSquare className="size-3" /> {l.followUps}
            </span>
          )}
        </div>
        {l.courseInterest && <p className="text-muted-foreground mt-1.5 text-xs">Interest: {l.courseInterest}</p>}
      </div>
    );
  }

  const canAdd = form.name.trim().length >= 2 && form.phone.trim().length >= 6;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Enquiries from the website and manual entries — track and follow up."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" nativeButton={false} render={<a href={exportHref} />}>
              <Download className="size-4" /> Export
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Add lead
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
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
        data={leads}
        columns={columns}
        rowKey={(l) => l.id}
        renderCard={renderCard}
        emptyIcon={Target}
        emptyTitle="No leads yet"
        emptyDescription="Website enquiries and manual leads will show up here."
        toolbar={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setParams({ search: search || undefined, page: 1 });
              }}
              className="relative flex-1"
            >
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, email…" className="pl-9" />
            </form>
            <Select value={query.status ?? ALL} onValueChange={(v) => setParams({ status: !v || v === ALL ? undefined : v, page: 1 })}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue>{(v) => (!v || v === ALL ? "All statuses" : LEAD_STATUS_LABELS[v as keyof typeof LEAD_STATUS_LABELS])}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {LEAD_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {LEAD_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={query.source ?? ALL} onValueChange={(v) => setParams({ source: !v || v === ALL ? undefined : v, page: 1 })}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue>{(v) => (!v || v === ALL ? "All sources" : LEAD_SOURCE_LABELS[v as keyof typeof LEAD_SOURCE_LABELS])}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All sources</SelectItem>
                {LEAD_SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {LEAD_SOURCE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setParams({ search: undefined, status: undefined, source: undefined, page: 1 });
                }}
              >
                Clear
              </Button>
            )}
          </div>
        }
        footer={
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">{total} leads</span>
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

      {/* Add lead */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a lead</DialogTitle>
            <DialogDescription>Manually capture an enquiry.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="l-name">Name</Label>
                <Input id="l-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <PhoneInput value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="l-email">Email (optional)</Label>
                <Input id="l-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: (v as LeadSource) ?? "MANUAL" }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => LEAD_SOURCE_LABELS[(v as LeadSource) ?? "MANUAL"]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {LEAD_SOURCE_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-interest">Course interest (optional)</Label>
              <Input id="l-interest" value={form.courseInterest} onChange={(e) => setForm((f) => ({ ...f, courseInterest: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-msg">Notes (optional)</Label>
              <Textarea id="l-msg" rows={2} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating || !canAdd}>
                {creating && <Loader2 className="size-4 animate-spin" />}
                Add lead
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <LeadDetailSheet leadId={detailId} assignees={assignees} onOpenChange={(o) => !o && setDetailId(null)} />

      <AlertDialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.name}&apos;s enquiry and all follow-ups will be permanently removed.
            </AlertDialogDescription>
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
