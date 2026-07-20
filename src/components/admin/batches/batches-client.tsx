"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { format } from "date-fns";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Layers,
  CalendarClock,
  Radio,
  Users,
  X,
  CalendarDays,
  Eye,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import {
  BATCH_STATUSES,
  BATCH_STATUS_LABEL,
  WEEKDAYS,
} from "@/lib/validations/batch";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { BatchDetailSheet } from "@/components/admin/batches/batch-detail-sheet";
import { cn } from "@/lib/utils";

interface Schedule {
  days: string[];
  startTime: string;
  endTime: string;
}
interface BatchRow {
  id: string;
  name: string;
  code: string;
  status: string;
  courseId: string;
  courseTitle: string;
  instructorId: string | null;
  instructorName: string | null;
  capacity: number | null;
  enrolledCount: number;
  startDate: string | null;
  endDate: string | null;
  schedule: Schedule | null;
}
interface Stats {
  total: number;
  upcoming: number;
  ongoing: number;
  completed: number;
  learners: number;
}
interface Query {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  courseId?: string;
}
interface Opt {
  id: string;
  title?: string;
  name?: string;
}

const STATUS_BADGE: Record<string, string> = {
  UPCOMING: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  ONGOING: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  COMPLETED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};
const ALL = "all";
const NONE = "none";

interface FormState {
  name: string;
  code: string;
  courseId: string;
  instructorId: string;
  status: string;
  capacity: string;
  startDate: string;
  endDate: string;
  days: string[];
  startTime: string;
  endTime: string;
}
const EMPTY: FormState = {
  name: "",
  code: "",
  courseId: "",
  instructorId: "",
  status: "UPCOMING",
  capacity: "",
  startDate: "",
  endDate: "",
  days: [],
  startTime: "",
  endTime: "",
};

function fromBatch(b: BatchRow): FormState {
  return {
    name: b.name,
    code: b.code,
    courseId: b.courseId,
    instructorId: b.instructorId ?? "",
    status: b.status,
    capacity: b.capacity != null ? String(b.capacity) : "",
    startDate: b.startDate ? b.startDate.slice(0, 10) : "",
    endDate: b.endDate ? b.endDate.slice(0, 10) : "",
    days: b.schedule?.days ?? [],
    startTime: b.schedule?.startTime ?? "",
    endTime: b.schedule?.endTime ?? "",
  };
}

function fmtDate(iso: string | null): string {
  return iso ? format(new Date(iso), "d MMM yyyy") : "";
}

export function BatchesClient({
  batches,
  total,
  query,
  stats,
  courses,
  instructors,
}: {
  batches: BatchRow[];
  total: number;
  query: Query;
  stats: Stats;
  courses: Opt[];
  instructors: Opt[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(query.search ?? "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BatchRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<BatchRow | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const hasFilters = Boolean(query.search || query.status || query.courseId);

  const batchesExportHref = (() => {
    const p = new URLSearchParams();
    if (query.search) p.set("search", query.search);
    if (query.status) p.set("status", query.status);
    if (query.courseId) p.set("course", query.courseId);
    const qs = p.toString();
    return `/api/batches/export${qs ? `?${qs}` : ""}`;
  })();

  const setParams = useCallback(
    (next: Record<string, string | number | undefined>) => {
      const merged = {
        search: query.search,
        status: query.status,
        course: query.courseId,
        page: query.page,
        ...next,
      };
      const p = new URLSearchParams();
      if (merged.search) p.set("search", String(merged.search));
      if (merged.status) p.set("status", String(merged.status));
      if (merged.course) p.set("course", String(merged.course));
      if (merged.page && Number(merged.page) > 1) p.set("page", String(merged.page));
      const qs = p.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, query],
  );

  function clearFilters() {
    setSearch("");
    setParams({ search: undefined, status: undefined, course: undefined, page: 1 });
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  function toggleDay(day: string) {
    setForm((prev) => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter((d) => d !== day)
        : [...prev.days, day],
    }));
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setDialogOpen(true);
  }
  function openEdit(b: BatchRow) {
    setEditing(b);
    setForm(fromBatch(b));
    setDialogOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name,
      code: form.code || undefined,
      courseId: form.courseId,
      instructorId: form.instructorId || undefined,
      status: form.status,
      capacity: form.capacity ? Number(form.capacity) : undefined,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      schedule: { days: form.days, startTime: form.startTime, endTime: form.endTime },
    };
    try {
      if (editing) {
        await api.patch(`/api/batches/${editing.id}`, payload);
        toast.success("Batch updated.");
      } else {
        await api.post("/api/batches", payload);
        toast.success("Batch created.");
      }
      setDialogOpen(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const d = err.details as { issues?: { message: string }[] } | undefined;
        toast.error(d?.issues?.[0]?.message ?? err.message);
      } else toast.error("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/batches/${deleting.id}`);
      toast.success("Batch deleted.");
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  const statCards = [
    { label: "Total batches", value: stats.total, icon: Layers, tone: "text-rose-500" },
    { label: "Upcoming", value: stats.upcoming, icon: CalendarClock, tone: "text-sky-500" },
    { label: "Ongoing", value: stats.ongoing, icon: Radio, tone: "text-emerald-500" },
    { label: "Learners", value: stats.learners, icon: Users, tone: "text-violet-500" },
  ];

  const columns: Column<BatchRow>[] = [
    {
      key: "name",
      header: "Batch",
      cell: (b) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{b.name}</p>
          <p className="text-muted-foreground truncate text-xs">
            {b.code}
            {b.instructorName ? ` · ${b.instructorName}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "course",
      header: "Course",
      cell: (b) => <span className="text-muted-foreground line-clamp-2 text-sm">{b.courseTitle}</span>,
    },
    {
      key: "schedule",
      header: "Schedule",
      cell: (b) =>
        b.schedule && (b.schedule.days.length || b.schedule.startTime) ? (
          <div className="text-sm">
            <p>{b.schedule.days.join(", ") || "—"}</p>
            {b.schedule.startTime && (
              <p className="text-muted-foreground text-xs">
                {b.schedule.startTime}
                {b.schedule.endTime ? `–${b.schedule.endTime}` : ""}
              </p>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        ),
    },
    {
      key: "dates",
      header: "Dates",
      cell: (b) =>
        b.startDate || b.endDate ? (
          <span className="text-sm whitespace-nowrap">
            {fmtDate(b.startDate) || "—"}
            {b.endDate ? ` – ${fmtDate(b.endDate)}` : ""}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        ),
    },
    {
      key: "seats",
      header: "Seats",
      cell: (b) => {
        const cap = b.capacity ?? 0;
        const pct = cap ? Math.min(100, Math.round((b.enrolledCount / cap) * 100)) : 0;
        return (
          <div className="w-24">
            <p className="text-sm tabular-nums">
              {b.enrolledCount}
              <span className="text-muted-foreground">{cap ? ` / ${cap}` : ""}</span>
            </p>
            {cap > 0 && (
              <div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
                <div
                  className={cn(
                    "h-full rounded-full",
                    pct >= 100 ? "bg-rose-500" : "bg-primary",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (b) => (
        <Badge variant="secondary" className={STATUS_BADGE[b.status]}>
          {BATCH_STATUS_LABEL[b.status] ?? b.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "w-10",
      cell: (b) => rowActions(b),
    },
  ];

  function rowActions(b: BatchRow) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />} aria-label="Actions">
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDetailId(b.id)}>
            <Eye className="size-4" /> View details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openEdit(b)}>
            <Pencil className="size-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleting(b)}
          >
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function renderBatchCard(b: BatchRow) {
    const cap = b.capacity ?? 0;
    const pct = cap ? Math.min(100, Math.round((b.enrolledCount / cap) * 100)) : 0;
    return (
      <div className="rounded-xl border p-4">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => setDetailId(b.id)}
            className="min-w-0 flex-1 text-left"
          >
            <p className="truncate font-medium">{b.name}</p>
            <p className="text-muted-foreground truncate text-xs">
              {b.code}
              {b.instructorName ? ` · ${b.instructorName}` : ""}
            </p>
          </button>
          <div className="flex shrink-0 items-center gap-1">
            <Badge variant="secondary" className={STATUS_BADGE[b.status]}>
              {BATCH_STATUS_LABEL[b.status] ?? b.status}
            </Badge>
            {rowActions(b)}
          </div>
        </div>

        <p className="text-muted-foreground mt-2 truncate text-sm">{b.courseTitle}</p>

        <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {b.schedule && (b.schedule.days.length || b.schedule.startTime) ? (
            <span className="flex items-center gap-1">
              <CalendarClock className="size-3.5" />
              {b.schedule.days.join(", ") || "—"}
              {b.schedule.startTime ? ` · ${b.schedule.startTime}` : ""}
            </span>
          ) : null}
          {(b.startDate || b.endDate) && (
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" />
              {fmtDate(b.startDate) || "—"}
              {b.endDate ? ` – ${fmtDate(b.endDate)}` : ""}
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <span className="text-sm tabular-nums">
            {b.enrolledCount}
            <span className="text-muted-foreground">{cap ? ` / ${cap}` : ""}</span>
          </span>
          {cap > 0 && (
            <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
              <div
                className={cn("h-full rounded-full", pct >= 100 ? "bg-rose-500" : "bg-primary")}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  const canSave = form.name.trim().length >= 3 && Boolean(form.courseId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Batches"
        description="Schedule and manage course cohorts, their timings and capacity."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" nativeButton={false} render={<a href={batchesExportHref} />}>
              <Download className="size-4" /> Export
            </Button>
            <Button onClick={openCreate}>
              <Plus className="size-4" /> New batch
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
                <p className="text-2xl font-semibold leading-none tabular-nums">
                  {s.value.toLocaleString("en-IN")}
                </p>
                <p className="text-muted-foreground mt-1 truncate text-xs">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={batches}
        rowKey={(b) => b.id}
        renderCard={renderBatchCard}
        emptyIcon={CalendarDays}
        emptyTitle={hasFilters ? "No matching batches" : "No batches yet"}
        emptyDescription={
          hasFilters ? "Try adjusting your search or filters." : "Create your first batch to get started."
        }
        toolbar={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setParams({ search: search || undefined, page: 1 });
              }}
              className="flex-1 sm:max-w-xs"
            >
              <Input
                placeholder="Search batches…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </form>
            <div className="flex gap-2">
              <Select
                value={query.status ?? ALL}
                onValueChange={(v) => setParams({ status: !v || v === ALL ? undefined : v, page: 1 })}
              >
                <SelectTrigger className="flex-1 sm:w-40">
                  <SelectValue>
                    {(v) => (!v || v === ALL ? "All statuses" : BATCH_STATUS_LABEL[String(v)])}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {BATCH_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {BATCH_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={query.courseId ?? ALL}
                onValueChange={(v) => setParams({ course: !v || v === ALL ? undefined : v, page: 1 })}
              >
                <SelectTrigger className="flex-1 sm:w-48">
                  <SelectValue>
                    {(v) =>
                      !v || v === ALL
                        ? "All courses"
                        : (courses.find((c) => c.id === v)?.title ?? "Course")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All courses</SelectItem>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
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
              {total} {total === 1 ? "batch" : "batches"}
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

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit batch" : "New batch"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update this cohort's details." : "Set up a new cohort for a course."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="b-name">Batch name</Label>
              <Input
                id="b-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Data Science — Aug 2026 (Weekend)"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Course</Label>
                <Select value={form.courseId} onValueChange={(v) => v && set("courseId", v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a course">
                      {(v) => courses.find((c) => c.id === v)?.title ?? "Choose a course"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Instructor</Label>
                <Select
                  value={form.instructorId || NONE}
                  onValueChange={(v) => set("instructorId", v === NONE ? "" : (v ?? ""))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) =>
                        !v || v === NONE
                          ? "Unassigned"
                          : (instructors.find((i) => i.id === v)?.name ?? "Unassigned")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Unassigned</SelectItem>
                    {instructors.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => v && set("status", v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => BATCH_STATUS_LABEL[String(v)]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {BATCH_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {BATCH_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-cap">Capacity</Label>
                <Input
                  id="b-cap"
                  type="number"
                  min={1}
                  value={form.capacity}
                  onChange={(e) => set("capacity", e.target.value)}
                  placeholder="e.g. 50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-code">Code</Label>
                <Input
                  id="b-code"
                  value={form.code}
                  onChange={(e) => set("code", e.target.value)}
                  placeholder="auto"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="b-start">Start date</Label>
                <Input id="b-start" type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-end">End date</Label>
                <Input id="b-end" type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Weekly schedule</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => {
                  const on = form.days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(d)}
                      className={cn(
                        "h-8 w-11 rounded-md border text-xs font-medium transition-colors",
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => set("startTime", e.target.value)}
                  className="w-32"
                  aria-label="Start time"
                />
                <span className="text-muted-foreground text-sm">to</span>
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => set("endTime", e.target.value)}
                  className="w-32"
                  aria-label="End time"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSave || saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {editing ? "Save changes" : "Create batch"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <BatchDetailSheet batchId={detailId} onOpenChange={(o) => !o && setDetailId(null)} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the batch. Batches with enrolled learners can&apos;t be deleted.
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
