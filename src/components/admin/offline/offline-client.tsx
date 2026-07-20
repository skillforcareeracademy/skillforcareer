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
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
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
}

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
  batches: Opt[];
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

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

  const setParams = useCallback(
    (next: Record<string, string | number | undefined>) => {
      const merged = { search: query.search, page: query.page, ...next };
      const p = new URLSearchParams();
      if (merged.search) p.set("search", String(merged.search));
      if (merged.page && Number(merged.page) > 1) p.set("page", String(merged.page));
      const qs = p.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, query],
  );

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

  const columns: Column<OfflineRow>[] = [
    {
      key: "title",
      header: "Class",
      cell: (c) => (
        <button type="button" onClick={() => setAttendId(c.id)} className="min-w-0 text-left">
          <p className="hover:text-primary truncate font-medium transition-colors">{c.title}</p>
          <p className="text-muted-foreground truncate text-xs">{c.courseTitle ?? c.batchName ?? "—"}</p>
        </button>
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
            <DropdownMenuItem onClick={() => openEdit(c)}>
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
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
            <button type="button" onClick={() => setAttendId(c.id)} className="min-w-0 text-left">
              <p className="truncate font-medium">{c.title}</p>
              <p className="text-muted-foreground truncate text-xs">{c.courseTitle ?? c.batchName ?? "—"}</p>
            </button>
            <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="flex items-center gap-1"><CalendarClock className="size-3" /> {format(new Date(c.scheduledStart), "d MMM, h:mm a")}</span>
              {c.location && <span className="flex items-center gap-1"><MapPin className="size-3" /> {c.location}</span>}
              <span>{c.studentCount} students</span>
              <span>{c.attendanceMarked} marked</span>
            </div>
          </div>
        )}
        emptyIcon={School}
        emptyTitle="No offline classes yet"
        emptyDescription="Create an in-person session to track attendance."
        toolbar={
          <form onSubmit={(e) => { e.preventDefault(); setParams({ search: search || undefined, page: 1 }); }} className="relative max-w-xs flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search classes…" className="pl-9" />
          </form>
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
                <Select value={form.courseId || NONE} onValueChange={(v) => setForm((f) => ({ ...f, courseId: v === NONE ? "" : (v ?? "") }))}>
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
                    {batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
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

      <AttendanceSheet meetingId={attendId} onOpenChange={(o) => !o && setAttendId(null)} />

      <StudentsSheet
        meetingId={studentsFor?.id ?? null}
        title={studentsFor?.title ?? ""}
        onOpenChange={(o) => !o && setStudentsFor(null)}
      />
    </div>
  );
}
