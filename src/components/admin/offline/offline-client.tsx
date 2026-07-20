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
import { AttendanceSheet } from "@/components/admin/offline/attendance-sheet";

interface OfflineRow {
  id: string;
  title: string;
  location: string | null;
  courseTitle: string | null;
  batchName: string | null;
  hostName: string;
  scheduledStart: string;
  attendanceMarked: number;
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
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [creating, setCreating] = useState(false);
  const [attendId, setAttendId] = useState<string | null>(null);

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

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post("/api/offline-classes", {
        title: form.title,
        description: form.description || undefined,
        courseId: form.courseId || undefined,
        batchId: form.batchId || undefined,
        scheduledStart: form.scheduledStart,
        scheduledEnd: form.scheduledEnd || undefined,
        location: form.location,
      });
      toast.success("Offline class created.");
      setCreateOpen(false);
      setForm(blank);
      router.refresh();
    } catch (err) {
      const d = err instanceof ApiError ? (err.details as { issues?: { message: string }[] }) : undefined;
      toast.error(d?.issues?.[0]?.message ?? (err instanceof ApiError ? err.message : "Couldn't create."));
    } finally {
      setCreating(false);
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
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const canCreate = form.title.trim().length >= 3 && form.location.trim().length >= 2 && Boolean(form.scheduledStart);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offline classes"
        description="In-person sessions with manual attendance marking."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
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

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New offline class</DialogTitle>
            <DialogDescription>An in-person session — you&apos;ll mark attendance manually.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-4">
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
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={creating || !canCreate}>
                {creating && <Loader2 className="size-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AttendanceSheet meetingId={attendId} onOpenChange={(o) => !o && setAttendId(null)} />
    </div>
  );
}
