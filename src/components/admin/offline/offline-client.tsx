"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { format } from "date-fns";
import {
  Plus,
  Search,
  MapPin,
  MoreHorizontal,
  ClipboardCheck,
  Loader2,
  CalendarClock,
  School,
  Pencil,
  Trash2,
  Users,
  Video,
  Link2,
  Ban,
  RotateCcw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { MEETING_STATUS_LABEL } from "@/lib/validations/live";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { AttendanceSheet } from "@/components/admin/offline/attendance-sheet";
import { StudentsSheet } from "@/components/admin/offline/students-sheet";

interface OfflineRow {
  id: string;
  title: string;
  status: string;
  location: string | null;
  courseTitle: string | null;
  batchName: string | null;
  hostName: string;
  scheduledStart: string;
  attendanceMarked: number;
  description: string | null;
  courseId: string | null;
  batchId: string | null;
  scheduledEnd: string | null;
  studentCount: number;
  roomCode: string;
}
interface Opt {
  id: string;
  title?: string;
  name?: string;
}
interface Query {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  courseId?: string;
  batchId?: string;
}
interface BatchOpt {
  id: string;
  name: string;
  courseId: string;
  courseTitle: string;
}

const ALL = "all";
/** Offline sessions are never "live" — they happen in a room, not a browser. */
const OFFLINE_STATUSES = ["SCHEDULED", "ENDED", "CANCELLED"] as const;

const STATUS_BADGE: Record<string, string> = {
  SCHEDULED: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  LIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  ENDED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

const NONE = "none";
const blank = { title: "", description: "", courseId: "", batchId: "", scheduledStart: "", scheduledEnd: "", location: "" };

/** ISO → the `yyyy-MM-ddTHH:mm` shape a datetime-local input expects, in local time. */
const toLocalInput = (iso: string | null) =>
  iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : "";

function formFor(c: OfflineRow) {
  return {
    title: c.title,
    description: c.description ?? "",
    courseId: c.courseId ?? "",
    batchId: c.batchId ?? "",
    scheduledStart: toLocalInput(c.scheduledStart),
    scheduledEnd: toLocalInput(c.scheduledEnd),
    location: c.location ?? "",
  };
}

export function OfflineClient({
  classes,
  total,
  query,
  courses,
  batches,
}: {
  classes: OfflineRow[];
  total: number;
  query: Query;
  courses: Opt[];
  batches: BatchOpt[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(query.search ?? "");
  const [formOpen, setFormOpen] = useState(false);
  /** null = the dialog is creating; a row = it's editing that row. */
  const [editing, setEditing] = useState<OfflineRow | null>(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<OfflineRow | null>(null);
  const [attendId, setAttendId] = useState<string | null>(null);
  const [studentsFor, setStudentsFor] = useState<OfflineRow | null>(null);
  const [rescheduling, setRescheduling] = useState<OfflineRow | null>(null);
  const [reForm, setReForm] = useState({ scheduledStart: "", scheduledEnd: "", reason: "" });
  const [reSaving, setReSaving] = useState(false);
  const [cancelling, setCancelling] = useState<OfflineRow | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const hasFilters = Boolean(
    query.search || query.status || query.courseId || query.batchId,
  );
  /** Choosing a course narrows the batch filter to that course's cohorts. */
  const batchOptions = query.courseId
    ? batches.filter((b) => b.courseId === query.courseId)
    : batches;

  const setParams = useCallback(
    (next: Record<string, string | number | undefined>) => {
      const merged = {
        search: query.search,
        status: query.status,
        course: query.courseId,
        batch: query.batchId,
        page: query.page,
        ...next,
      };
      const p = new URLSearchParams();
      if (merged.search) p.set("search", String(merged.search));
      if (merged.status) p.set("status", String(merged.status));
      if (merged.course) p.set("course", String(merged.course));
      if (merged.batch) p.set("batch", String(merged.batch));
      if (merged.page && Number(merged.page) > 1) p.set("page", String(merged.page));
      const qs = p.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, query],
  );

  function clearFilters() {
    setSearch("");
    setParams({
      search: undefined,
      status: undefined,
      course: undefined,
      batch: undefined,
      page: 1,
    });
  }

  function openReschedule(c: OfflineRow) {
    setRescheduling(c);
    setReForm({
      scheduledStart: toLocalInput(c.scheduledStart),
      scheduledEnd: toLocalInput(c.scheduledEnd),
      reason: "",
    });
  }

  /** Moves the class and tells everyone enrolled — same endpoint live uses. */
  async function submitReschedule(e: FormEvent) {
    e.preventDefault();
    if (!rescheduling) return;
    setReSaving(true);
    try {
      const res = await api.post<{ notified: number }>(
        `/api/meetings/${rescheduling.id}/reschedule`,
        {
          scheduledStart: reForm.scheduledStart,
          scheduledEnd: reForm.scheduledEnd || undefined,
          reason: reForm.reason || undefined,
        },
      );
      toast.success(
        res.notified > 0
          ? `Class rescheduled · ${res.notified} learner${res.notified === 1 ? "" : "s"} notified.`
          : "Class rescheduled.",
      );
      setRescheduling(null);
      router.refresh();
    } catch (err) {
      const d = err instanceof ApiError ? (err.details as { issues?: { message: string }[] }) : undefined;
      toast.error(d?.issues?.[0]?.message ?? (err instanceof ApiError ? err.message : "Couldn't reschedule."));
    } finally {
      setReSaving(false);
    }
  }

  async function setStatus(c: OfflineRow, status: string) {
    try {
      await api.post(`/api/meetings/${c.id}/status`, { status });
      toast.success(status === "CANCELLED" ? "Class cancelled." : "Class restored.");
      setCancelling(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update the class.");
    }
  }

  /** Cohorts of the course chosen in the create/edit dialog. */
  const formBatches = form.courseId
    ? batches.filter((b) => b.courseId === form.courseId)
    : batches;

  function openCreate() {
    setEditing(null);
    setForm(blank);
    setFormOpen(true);
  }

  function openEdit(c: OfflineRow) {
    setEditing(c);
    setForm(formFor(c));
    setFormOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      title: form.title,
      description: form.description || undefined,
      courseId: form.courseId || undefined,
      batchId: form.batchId || undefined,
      scheduledStart: form.scheduledStart,
      scheduledEnd: form.scheduledEnd || undefined,
      location: form.location,
    };
    try {
      if (editing) {
        await api.patch(`/api/offline-classes/${editing.id}`, payload);
        toast.success("Offline class saved.");
      } else {
        await api.post("/api/offline-classes", payload);
        toast.success("Offline class created.");
      }
      setFormOpen(false);
      setEditing(null);
      setForm(blank);
      router.refresh();
    } catch (err) {
      const d = err instanceof ApiError ? (err.details as { issues?: { message: string }[] }) : undefined;
      toast.error(d?.issues?.[0]?.message ?? (err instanceof ApiError ? err.message : "Couldn't save."));
    } finally {
      setSaving(false);
    }
  }

  /** Every class carries a room code, so an in-person session can still host
   *  anyone joining remotely. */
  const roomUrl = (c: OfflineRow) =>
    `${window.location.origin}/live/room/${c.roomCode}`;

  async function copyVideoLink(c: OfflineRow) {
    try {
      await navigator.clipboard.writeText(roomUrl(c));
      toast.success("Video link copied.");
    } catch {
      toast.error("Couldn't copy — check clipboard permissions.");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/offline-classes/${deleting.id}`);
      toast.success("Offline class deleted.");
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  function statusBadge(status: string) {
    return (
      <Badge variant="secondary" className={STATUS_BADGE[status] ?? ""}>
        {MEETING_STATUS_LABEL[status] ?? status}
      </Badge>
    );
  }

  const columns: Column<OfflineRow>[] = [
    {
      key: "title",
      header: "Class",
      cell: (c) => (
        <button type="button" onClick={() => setAttendId(c.id)} className="min-w-0 text-left">
          <p className="hover:text-primary truncate font-medium transition-colors">{c.title}</p>
          <p className="text-muted-foreground truncate text-xs">{c.hostName}</p>
        </button>
      ),
    },
    {
      key: "course",
      header: "Course",
      cell: (c) => (
        <span className="block max-w-[13rem] truncate text-sm">{c.courseTitle ?? "—"}</span>
      ),
    },
    {
      key: "batch",
      header: "Batch",
      cell: (c) =>
        c.batchName ? (
          <button
            type="button"
            onClick={() => setParams({ batch: c.batchId ?? undefined, page: 1 })}
            className="hover:text-primary block max-w-[11rem] truncate text-left text-sm transition-colors"
            title={`Show only ${c.batchName}`}
          >
            {c.batchName}
          </button>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        ),
    },
    {
      key: "when",
      header: "When",
      cell: (c) => <span className="text-sm whitespace-nowrap">{format(new Date(c.scheduledStart), "d MMM, h:mm a")}</span>,
    },
    {
      key: "location",
      header: "Venue",
      cell: (c) => (
        <span className="text-muted-foreground flex items-center gap-1 text-sm">
          <MapPin className="size-3.5" /> {c.location ?? "—"}
        </span>
      ),
    },
    {
      key: "students",
      header: "Students",
      className: "tabular-nums",
      cell: (c) => (
        <button
          type="button"
          onClick={() => setStudentsFor(c)}
          className="hover:text-primary text-sm transition-colors"
        >
          {c.studentCount} added
        </button>
      ),
    },
    {
      key: "att",
      header: "Attendance",
      className: "tabular-nums",
      cell: (c) => <span className="text-sm">{c.attendanceMarked} marked</span>,
    },
    { key: "status", header: "Status", cell: (c) => statusBadge(c.status) },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "w-10",
      cell: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />} aria-label="Actions">
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setAttendId(c.id)}>
              <ClipboardCheck className="size-4" /> Mark attendance
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStudentsFor(c)}>
              <Users className="size-4" /> Add / manage students
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => copyVideoLink(c)}>
              <Link2 className="size-4" /> Copy video link
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => window.open(roomUrl(c), "_blank", "noopener")}
            >
              <Video className="size-4" /> Open video room
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openReschedule(c)}>
              <CalendarClock className="size-4" /> Reschedule
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openEdit(c)}>
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
            {c.status === "CANCELLED" ? (
              <DropdownMenuItem onClick={() => setStatus(c, "SCHEDULED")}>
                <RotateCcw className="size-4" /> Restore class
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setCancelling(c)}
              >
                <Ban className="size-4" /> Cancel class
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setDeleting(c)}
            >
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const canSave = form.title.trim().length >= 3 && form.location.trim().length >= 2 && Boolean(form.scheduledStart);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offline classes"
        description="In-person sessions with manual attendance marking."
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" /> New class
          </Button>
        }
      />

      <DataTable
        data={classes}
        columns={columns}
        rowKey={(c) => c.id}
        renderCard={(c) => (
          <div className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-2">
              <button type="button" onClick={() => setAttendId(c.id)} className="min-w-0 flex-1 text-left">
                <p className="truncate font-medium">{c.title}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {c.courseTitle ?? "No course"}
                  {c.batchName ? ` · ${c.batchName}` : ""}
                </p>
              </button>
              {statusBadge(c.status)}
            </div>
            <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="flex items-center gap-1"><CalendarClock className="size-3" /> {format(new Date(c.scheduledStart), "d MMM, h:mm a")}</span>
              {c.location && <span className="flex items-center gap-1"><MapPin className="size-3" /> {c.location}</span>}
              <span>{c.studentCount} students</span>
              <span>{c.attendanceMarked} marked</span>
            </div>
          </div>
        )}
        emptyIcon={School}
        emptyTitle={hasFilters ? "No matching offline classes" : "No offline classes yet"}
        emptyDescription={
          hasFilters
            ? "Try adjusting your search or filters."
            : "Create an in-person session to track attendance."
        }
        toolbar={
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <form
              onSubmit={(e) => { e.preventDefault(); setParams({ search: search || undefined, page: 1 }); }}
              className="relative flex-1 lg:max-w-xs"
            >
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search classes or venue…" className="pl-9" />
            </form>
            <div className="flex flex-wrap gap-2">
              <Select
                value={query.status ?? ALL}
                onValueChange={(v) => setParams({ status: !v || v === ALL ? undefined : v, page: 1 })}
              >
                <SelectTrigger className="w-36">
                  <SelectValue>
                    {(v) => (!v || v === ALL ? "All statuses" : MEETING_STATUS_LABEL[String(v)])}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {OFFLINE_STATUSES.map((st) => (
                    <SelectItem key={st} value={st}>{MEETING_STATUS_LABEL[st]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={query.courseId ?? ALL}
                onValueChange={(v) =>
                  setParams({
                    course: !v || v === ALL ? undefined : v,
                    // A batch from another course would filter everything out.
                    batch: undefined,
                    page: 1,
                  })
                }
              >
                <SelectTrigger className="w-44">
                  <SelectValue>
                    {(v) => (!v || v === ALL ? "All courses" : (courses.find((c) => c.id === v)?.title ?? "Course"))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All courses</SelectItem>
                  {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select
                value={query.batchId ?? ALL}
                onValueChange={(v) => setParams({ batch: !v || v === ALL ? undefined : v, page: 1 })}
              >
                <SelectTrigger className="w-44">
                  <SelectValue>
                    {(v) => (!v || v === ALL ? "All batches" : (batches.find((b) => b.id === v)?.name ?? "Batch"))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All batches</SelectItem>
                  {batchOptions.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
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
            <span className="text-muted-foreground text-sm">{total} classes</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={query.page <= 1} onClick={() => setParams({ page: query.page - 1 })}>Previous</Button>
              <span className="text-muted-foreground text-sm">Page {query.page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={query.page >= totalPages} onClick={() => setParams({ page: query.page + 1 })}>Next</Button>
            </div>
          </div>
        }
      />

      {/* Create / edit */}
      <Dialog open={formOpen} onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit offline class" : "New offline class"}</DialogTitle>
            <DialogDescription>An in-person session — you&apos;ll mark attendance manually.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="o-title">Title</Label>
              <Input id="o-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Weekend workshop — SQL" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Course (optional)</Label>
                <Select
                  value={form.courseId || NONE}
                  onValueChange={(v) =>
                    setForm((f) => {
                      const courseId = v === NONE ? "" : (v ?? "");
                      // Drop a batch that belongs to a different course.
                      const batch = batches.find((b) => b.id === f.batchId);
                      const batchId = batch && batch.courseId !== courseId ? "" : f.batchId;
                      return { ...f, courseId, batchId };
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => (!v || v === NONE ? "None" : (courses.find((c) => c.id === v)?.title ?? "Course"))}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Batch (optional)</Label>
                <Select value={form.batchId || NONE} onValueChange={(v) => setForm((f) => ({ ...f, batchId: v === NONE ? "" : (v ?? "") }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => (!v || v === NONE ? "None" : (batches.find((b) => b.id === v)?.name ?? "Batch"))}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {formBatches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="o-start">Starts</Label>
                <Input id="o-start" type="datetime-local" value={form.scheduledStart} onChange={(e) => setForm((f) => ({ ...f, scheduledStart: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="o-end">Ends (optional)</Label>
                <Input id="o-end" type="datetime-local" value={form.scheduledEnd} onChange={(e) => setForm((f) => ({ ...f, scheduledEnd: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-loc">Venue / location</Label>
              <Input id="o-loc" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="e.g. Room 204, Koramangala campus" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-desc">Notes (optional)</Label>
              <Textarea id="o-desc" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !canSave}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {editing ? "Save changes" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the class and its {deleting?.attendanceMarked ?? 0} attendance
              record(s). This can&apos;t be undone.
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

      {/* Reschedule — reuses the live-class endpoint, so learners enrolled on
          the course or batch get the same "moved to…" notification. */}
      <Dialog open={!!rescheduling} onOpenChange={(o) => !o && setRescheduling(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reschedule class</DialogTitle>
            <DialogDescription>
              Everyone enrolled is told about the new time.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitReschedule} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="r-start">New start</Label>
                <Input
                  id="r-start"
                  type="datetime-local"
                  value={reForm.scheduledStart}
                  onChange={(e) => setReForm((f) => ({ ...f, scheduledStart: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-end">New end (optional)</Label>
                <Input
                  id="r-end"
                  type="datetime-local"
                  value={reForm.scheduledEnd}
                  onChange={(e) => setReForm((f) => ({ ...f, scheduledEnd: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-reason">Reason (optional)</Label>
              <Input
                id="r-reason"
                value={reForm.reason}
                onChange={(e) => setReForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Shared with learners in the notification"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRescheduling(null)}>Cancel</Button>
              <Button type="submit" disabled={reSaving || !reForm.scheduledStart}>
                {reSaving && <Loader2 className="size-4 animate-spin" />}
                Reschedule
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel “{cancelling?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The class is marked cancelled but keeps its roster and attendance,
              so you can restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelling && setStatus(cancelling, "CANCELLED")}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              Cancel class
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AttendanceSheet meetingId={attendId} onOpenChange={(o) => !o && setAttendId(null)} />

      <StudentsSheet
        meetingId={studentsFor?.id ?? null}
        title={studentsFor?.title ?? ""}
        onOpenChange={(o) => !o && setStudentsFor(null)}
      />
    </div>
  );
}
