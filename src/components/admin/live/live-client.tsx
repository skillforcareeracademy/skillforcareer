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
  Video,
  CalendarClock,
  Radio,
  CheckCircle2,
  X,
  Eye,
  Circle,
  Users,
  Play,
  Square,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import {
  MEETING_STATUSES,
  MEETING_STATUS_LABEL,
} from "@/lib/validations/live";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { LiveDetailSheet } from "@/components/admin/live/live-detail-sheet";
import { cn } from "@/lib/utils";

interface MeetingRow {
  id: string;
  title: string;
  status: string;
  roomCode: string;
  courseId: string | null;
  courseTitle: string | null;
  batchId: string | null;
  batchName: string | null;
  hostId: string;
  hostName: string;
  scheduledStart: string;
  scheduledEnd: string | null;
  maxParticipants: number | null;
  isRecordingEnabled: boolean;
  participants: number;
}
interface Stats {
  total: number;
  scheduled: number;
  live: number;
  ended: number;
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
  SCHEDULED: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  LIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  ENDED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};
const ALL = "all";
const NONE = "none";

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtWhen(iso: string): string {
  return format(new Date(iso), "d MMM yyyy, h:mm a");
}

interface FormState {
  title: string;
  description: string;
  hostId: string;
  courseId: string;
  batchId: string;
  status: string;
  scheduledStart: string;
  scheduledEnd: string;
  maxParticipants: string;
  isRecordingEnabled: boolean;
}
function blankForm(hostId: string): FormState {
  return {
    title: "",
    description: "",
    hostId,
    courseId: "",
    batchId: "",
    status: "SCHEDULED",
    scheduledStart: "",
    scheduledEnd: "",
    maxParticipants: "",
    isRecordingEnabled: false,
  };
}
function fromMeeting(m: MeetingRow): FormState {
  return {
    title: m.title,
    description: "",
    hostId: m.hostId,
    courseId: m.courseId ?? "",
    batchId: m.batchId ?? "",
    status: m.status,
    scheduledStart: toLocalInput(m.scheduledStart),
    scheduledEnd: m.scheduledEnd ? toLocalInput(m.scheduledEnd) : "",
    maxParticipants: m.maxParticipants != null ? String(m.maxParticipants) : "",
    isRecordingEnabled: m.isRecordingEnabled,
  };
}

export function LiveClient({
  meetings,
  total,
  query,
  stats,
  hosts,
  courses,
  batches,
}: {
  meetings: MeetingRow[];
  total: number;
  query: Query;
  stats: Stats;
  hosts: Opt[];
  courses: Opt[];
  batches: Opt[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const defaultHost = hosts[0]?.id ?? "";
  const [search, setSearch] = useState(query.search ?? "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MeetingRow | null>(null);
  const [form, setForm] = useState<FormState>(blankForm(defaultHost));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<MeetingRow | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<MeetingRow | null>(null);
  const [reForm, setReForm] = useState({ scheduledStart: "", scheduledEnd: "", reason: "" });
  const [reSaving, setReSaving] = useState(false);

  function openReschedule(m: MeetingRow) {
    setRescheduling(m);
    setReForm({
      scheduledStart: toLocalInput(m.scheduledStart),
      scheduledEnd: m.scheduledEnd ? toLocalInput(m.scheduledEnd) : "",
      reason: "",
    });
  }
  async function onReschedule(e: React.FormEvent) {
    e.preventDefault();
    if (!rescheduling) return;
    setReSaving(true);
    try {
      const res = await api.post<{ notified: number }>(`/api/meetings/${rescheduling.id}/reschedule`, {
        scheduledStart: reForm.scheduledStart,
        scheduledEnd: reForm.scheduledEnd || undefined,
        reason: reForm.reason || undefined,
      });
      toast.success(res.notified > 0 ? `Rescheduled — ${res.notified} learner${res.notified === 1 ? "" : "s"} notified.` : "Rescheduled.");
      setRescheduling(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't reschedule.");
    } finally {
      setReSaving(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const hasFilters = Boolean(query.search || query.status || query.courseId);

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
  function openCreate() {
    setEditing(null);
    setForm(blankForm(defaultHost));
    setDialogOpen(true);
  }
  function openEdit(m: MeetingRow) {
    setEditing(m);
    setForm(fromMeeting(m));
    setDialogOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      title: form.title,
      description: form.description || undefined,
      hostId: form.hostId,
      courseId: form.courseId || undefined,
      batchId: form.batchId || undefined,
      status: form.status,
      scheduledStart: form.scheduledStart,
      scheduledEnd: form.scheduledEnd || undefined,
      maxParticipants: form.maxParticipants ? Number(form.maxParticipants) : undefined,
      isRecordingEnabled: form.isRecordingEnabled,
    };
    try {
      if (editing) {
        await api.patch(`/api/meetings/${editing.id}`, payload);
        toast.success("Live class updated.");
      } else {
        await api.post("/api/meetings", payload);
        toast.success("Live class scheduled.");
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
      await api.del(`/api/meetings/${deleting.id}`);
      toast.success("Live class deleted.");
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  const statCards = [
    { label: "Total classes", value: stats.total, icon: Video, tone: "text-rose-500" },
    { label: "Scheduled", value: stats.scheduled, icon: CalendarClock, tone: "text-sky-500" },
    { label: "Live now", value: stats.live, icon: Radio, tone: "text-emerald-500" },
    { label: "Ended", value: stats.ended, icon: CheckCircle2, tone: "text-violet-500" },
  ];

  function statusBadge(status: string) {
    return (
      <Badge variant="secondary" className={cn("gap-1", STATUS_BADGE[status])}>
        {status === "LIVE" && <Circle className="size-2 animate-pulse fill-current" />}
        {MEETING_STATUS_LABEL[status] ?? status}
      </Badge>
    );
  }

  function openRoom(m: MeetingRow) {
    window.open(`/live/room/${m.roomCode}`, "_blank", "noopener");
  }
  async function changeStatus(m: MeetingRow, status: string, alsoOpen = false) {
    try {
      const res = await api.post<{ notified: number }>(`/api/meetings/${m.id}/status`, { status });
      toast.success(
        status === "LIVE"
          ? `Class started${res?.notified ? ` · ${res.notified} learner${res.notified === 1 ? "" : "s"} notified` : ""}.`
          : status === "ENDED"
            ? "Class ended."
            : "Status updated.",
      );
      if (alsoOpen) openRoom(m);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed.");
    }
  }

  function rowActions(m: MeetingRow) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />} aria-label="Actions">
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => openRoom(m)}>
            <ExternalLink className="size-4" /> Join room
          </DropdownMenuItem>
          {m.status === "SCHEDULED" && (
            <DropdownMenuItem
              className="text-emerald-600 focus:text-emerald-600"
              onClick={() => changeStatus(m, "LIVE", true)}
            >
              <Play className="size-4" /> Start class
            </DropdownMenuItem>
          )}
          {m.status === "LIVE" && (
            <DropdownMenuItem onClick={() => changeStatus(m, "ENDED")}>
              <Square className="size-4" /> End class
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setDetailId(m.id)}>
            <Eye className="size-4" /> View details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openReschedule(m)}>
            <CalendarClock className="size-4" /> Reschedule
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openEdit(m)}>
            <Pencil className="size-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleting(m)}
          >
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const columns: Column<MeetingRow>[] = [
    {
      key: "title",
      header: "Session",
      cell: (m) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{m.title}</p>
          <p className="text-muted-foreground truncate text-xs">
            {m.roomCode} · {m.hostName}
          </p>
        </div>
      ),
    },
    {
      key: "context",
      header: "Course / Batch",
      cell: (m) => (
        <div className="min-w-0 text-sm">
          <p className="truncate">{m.courseTitle ?? "—"}</p>
          {m.batchName && <p className="text-muted-foreground truncate text-xs">{m.batchName}</p>}
        </div>
      ),
    },
    {
      key: "when",
      header: "When",
      cell: (m) => <span className="text-sm whitespace-nowrap">{fmtWhen(m.scheduledStart)}</span>,
    },
    {
      key: "participants",
      header: "Attendees",
      className: "tabular-nums",
      cell: (m) => (
        <span className="text-sm">
          {m.participants}
          {m.maxParticipants ? <span className="text-muted-foreground"> / {m.maxParticipants}</span> : ""}
        </span>
      ),
    },
    { key: "status", header: "Status", cell: (m) => statusBadge(m.status) },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "w-10",
      cell: (m) => rowActions(m),
    },
  ];

  function renderCard(m: MeetingRow) {
    return (
      <div className="rounded-xl border p-4">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => setDetailId(m.id)}
            className="min-w-0 flex-1 text-left"
          >
            <p className="truncate font-medium">{m.title}</p>
            <p className="text-muted-foreground truncate text-xs">
              {m.roomCode} · {m.hostName}
            </p>
          </button>
          <div className="flex shrink-0 items-center gap-1">
            {statusBadge(m.status)}
            {rowActions(m)}
          </div>
        </div>
        {(m.courseTitle || m.batchName) && (
          <p className="text-muted-foreground mt-2 truncate text-sm">
            {m.courseTitle ?? ""}
            {m.courseTitle && m.batchName ? " · " : ""}
            {m.batchName ?? ""}
          </p>
        )}
        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="flex items-center gap-1">
            <CalendarClock className="size-3.5" /> {fmtWhen(m.scheduledStart)}
          </span>
          <span className="flex items-center gap-1">
            <Users className="size-3.5" /> {m.participants}
            {m.maxParticipants ? ` / ${m.maxParticipants}` : ""}
          </span>
        </div>
      </div>
    );
  }

  const canSave =
    form.title.trim().length >= 3 && Boolean(form.hostId) && Boolean(form.scheduledStart);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Classes"
        description="Schedule and manage live sessions, their timing, host and attendees."
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" /> Schedule class
          </Button>
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
        data={meetings}
        rowKey={(m) => m.id}
        renderCard={renderCard}
        emptyIcon={Video}
        emptyTitle={hasFilters ? "No matching live classes" : "No live classes yet"}
        emptyDescription={
          hasFilters ? "Try adjusting your search or filters." : "Schedule your first live class to get started."
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
                placeholder="Search live classes…"
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
                    {(v) => (!v || v === ALL ? "All statuses" : MEETING_STATUS_LABEL[String(v)])}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {MEETING_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {MEETING_STATUS_LABEL[s]}
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
              {total} {total === 1 ? "class" : "classes"}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit live class" : "Schedule live class"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update this live session." : "Set up a new live session for a course or batch."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="m-title">Title</Label>
              <Input
                id="m-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Live Q&A — Neural Networks"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-desc">Description</Label>
              <Textarea
                id="m-desc"
                rows={2}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="What will this session cover? (optional)"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Host</Label>
                <Select value={form.hostId} onValueChange={(v) => v && set("hostId", v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose host">
                      {(v) => hosts.find((h) => h.id === v)?.name ?? "Choose host"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {hosts.map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => v && set("status", v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => MEETING_STATUS_LABEL[String(v)]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {MEETING_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {MEETING_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Course</Label>
                <Select
                  value={form.courseId || NONE}
                  onValueChange={(v) => set("courseId", v === NONE ? "" : (v ?? ""))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) =>
                        !v || v === NONE ? "None" : (courses.find((c) => c.id === v)?.title ?? "None")
                      }
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
              <div className="space-y-1.5">
                <Label>Batch</Label>
                <Select
                  value={form.batchId || NONE}
                  onValueChange={(v) => set("batchId", v === NONE ? "" : (v ?? ""))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) =>
                        !v || v === NONE ? "None" : (batches.find((b) => b.id === v)?.name ?? "None")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {batches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="m-start">Starts</Label>
                <Input
                  id="m-start"
                  type="datetime-local"
                  value={form.scheduledStart}
                  onChange={(e) => set("scheduledStart", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-end">Ends</Label>
                <Input
                  id="m-end"
                  type="datetime-local"
                  value={form.scheduledEnd}
                  onChange={(e) => set("scheduledEnd", e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-end justify-between gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="m-max">Max participants</Label>
                <Input
                  id="m-max"
                  type="number"
                  min={1}
                  value={form.maxParticipants}
                  onChange={(e) => set("maxParticipants", e.target.value)}
                  placeholder="e.g. 100"
                  className="w-40"
                />
              </div>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <Switch
                  checked={form.isRecordingEnabled}
                  onCheckedChange={(v) => set("isRecordingEnabled", v)}
                />
                Record session
              </label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSave || saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {editing ? "Save changes" : "Schedule class"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <LiveDetailSheet meetingId={detailId} onOpenChange={(o) => !o && setDetailId(null)} />

      {/* Reschedule */}
      <Dialog open={rescheduling != null} onOpenChange={(o) => !o && setRescheduling(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reschedule class</DialogTitle>
            <DialogDescription>
              Move &ldquo;{rescheduling?.title}&rdquo; — enrolled learners are notified automatically.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onReschedule} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="re-start">New start</Label>
                <Input
                  id="re-start"
                  type="datetime-local"
                  value={reForm.scheduledStart}
                  onChange={(e) => setReForm((f) => ({ ...f, scheduledStart: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="re-end">New end (optional)</Label>
                <Input
                  id="re-end"
                  type="datetime-local"
                  value={reForm.scheduledEnd}
                  onChange={(e) => setReForm((f) => ({ ...f, scheduledEnd: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="re-reason">Reason (optional)</Label>
              <Textarea
                id="re-reason"
                rows={2}
                value={reForm.reason}
                onChange={(e) => setReForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. Instructor unavailable — moved to Friday."
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRescheduling(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={reSaving || !reForm.scheduledStart}>
                {reSaving && <Loader2 className="size-4 animate-spin" />}
                Reschedule &amp; notify
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
              This permanently removes the live class and its room. This can&apos;t be undone.
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
