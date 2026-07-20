"use client";

import { useCallback, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  MoreHorizontal,
  Trash2,
  MessagesSquare,
  MessageCircleQuestion,
  Pin,
  PinOff,
  Reply as ReplyIcon,
  CheckCircle2,
  RotateCcw,
  Eye,
  X,
  Plus,
  Loader2,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { DiscussionDetailSheet } from "@/components/admin/discussions/discussion-detail-sheet";

interface ThreadRow {
  id: string;
  title: string | null;
  body: string;
  courseId: string | null;
  courseTitle: string | null;
  authorName: string;
  authorAvatar: string | null;
  isPinned: boolean;
  isResolved: boolean;
  replies: number;
  updatedAt: string;
}
interface Stats {
  threads: number;
  open: number;
  pinned: number;
  replies: number;
}
interface Query {
  page: number;
  pageSize: number;
  search?: string;
  courseId?: string;
  status?: string;
}
interface Opt {
  id: string;
  title: string;
}

const ALL = "all";
const STATUS_OPTIONS = [
  { value: "OPEN", label: "Open" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "PINNED", label: "Pinned" },
];

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}
function label(t: ThreadRow): string {
  if (t.title) return t.title;
  return t.body.length > 80 ? `${t.body.slice(0, 80)}…` : t.body;
}

export function DiscussionsClient({
  threads,
  total,
  query,
  stats,
  courses,
}: {
  threads: ThreadRow[];
  total: number;
  query: Query;
  stats: Stats;
  courses: Opt[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(query.search ?? "");
  const [deleting, setDeleting] = useState<ThreadRow | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ courseId: "", title: "", body: "" });
  const [creating, setCreating] = useState(false);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post("/api/discussions", {
        courseId: form.courseId,
        title: form.title,
        body: form.body,
      });
      toast.success("Discussion started.");
      setCreateOpen(false);
      setForm({ courseId: "", title: "", body: "" });
      router.refresh();
    } catch (err) {
      const d = err instanceof ApiError ? (err.details as { issues?: { message: string }[] }) : undefined;
      toast.error(d?.issues?.[0]?.message ?? (err instanceof ApiError ? err.message : "Couldn't start discussion."));
    } finally {
      setCreating(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const hasFilters = Boolean(query.search || query.courseId || query.status);

  const setParams = useCallback(
    (next: Record<string, string | number | undefined>) => {
      const merged = {
        search: query.search,
        course: query.courseId,
        status: query.status,
        page: query.page,
        ...next,
      };
      const p = new URLSearchParams();
      if (merged.search) p.set("search", String(merged.search));
      if (merged.course) p.set("course", String(merged.course));
      if (merged.status) p.set("status", String(merged.status));
      if (merged.page && Number(merged.page) > 1) p.set("page", String(merged.page));
      const qs = p.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, query],
  );

  function clearFilters() {
    setSearch("");
    setParams({ search: undefined, course: undefined, status: undefined, page: 1 });
  }

  async function moderate(t: ThreadRow, patch: { isPinned?: boolean; isResolved?: boolean }) {
    try {
      await api.patch(`/api/discussions/${t.id}`, patch);
      toast.success("Updated.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed.");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/discussions/${deleting.id}`);
      toast.success("Discussion deleted.");
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  const statCards = [
    { label: "Threads", value: stats.threads, icon: MessagesSquare, tone: "text-rose-500" },
    { label: "Open", value: stats.open, icon: MessageCircleQuestion, tone: "text-amber-500" },
    { label: "Pinned", value: stats.pinned, icon: Pin, tone: "text-sky-500" },
    { label: "Replies", value: stats.replies, icon: ReplyIcon, tone: "text-violet-500" },
  ];

  function statusBadges(t: ThreadRow) {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        {t.isPinned && (
          <Badge variant="secondary" className="gap-1 bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
            <Pin className="size-3" /> Pinned
          </Badge>
        )}
        <Badge
          variant="secondary"
          className={
            t.isResolved
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
              : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
          }
        >
          {t.isResolved ? "Resolved" : "Open"}
        </Badge>
      </span>
    );
  }

  function rowActions(t: ThreadRow) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />} aria-label="Actions">
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDetailId(t.id)}>
            <Eye className="size-4" /> View &amp; reply
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => moderate(t, { isPinned: !t.isPinned })}>
            {t.isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
            {t.isPinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => moderate(t, { isResolved: !t.isResolved })}>
            {t.isResolved ? <RotateCcw className="size-4" /> : <CheckCircle2 className="size-4" />}
            {t.isResolved ? "Reopen" : "Resolve"}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleting(t)}
          >
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const columns: Column<ThreadRow>[] = [
    {
      key: "thread",
      header: "Discussion",
      cell: (t) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-8 shrink-0">
            {t.authorAvatar && <AvatarImage src={t.authorAvatar} alt={t.authorName} />}
            <AvatarFallback className="text-xs">{initials(t.authorName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{label(t)}</p>
            <p className="text-muted-foreground truncate text-xs">
              {t.courseTitle ?? "General"} · {t.authorName}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "replies",
      header: "Replies",
      className: "tabular-nums",
      cell: (t) => (
        <span className="flex items-center gap-1 text-sm">
          <ReplyIcon className="size-3.5 text-muted-foreground" /> {t.replies}
        </span>
      ),
    },
    { key: "status", header: "Status", cell: statusBadges },
    {
      key: "activity",
      header: "Activity",
      cell: (t) => (
        <span className="text-muted-foreground text-sm whitespace-nowrap">
          {formatDistanceToNow(new Date(t.updatedAt), { addSuffix: true })}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "w-10",
      cell: (t) => rowActions(t),
    },
  ];

  function renderCard(t: ThreadRow) {
    return (
      <div className="rounded-xl border p-4">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => setDetailId(t.id)}
            className="min-w-0 flex-1 text-left"
          >
            <p className="line-clamp-2 font-medium">{label(t)}</p>
            <p className="text-muted-foreground truncate text-xs">
              {t.courseTitle ?? "General"} · {t.authorName}
            </p>
          </button>
          {rowActions(t)}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          {statusBadges(t)}
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <ReplyIcon className="size-3.5" /> {t.replies}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discussions"
        description="Moderate course discussions — reply, pin, resolve or remove threads."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New discussion
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
        data={threads}
        rowKey={(t) => t.id}
        renderCard={renderCard}
        emptyIcon={MessagesSquare}
        emptyTitle={hasFilters ? "No matching discussions" : "No discussions yet"}
        emptyDescription={
          hasFilters ? "Try adjusting your search or filters." : "Learner discussions will appear here to moderate."
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
                placeholder="Search discussions…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </form>
            <div className="flex gap-2">
              <Select
                value={query.status ?? ALL}
                onValueChange={(v) => setParams({ status: !v || v === ALL ? undefined : v, page: 1 })}
              >
                <SelectTrigger className="flex-1 sm:w-36">
                  <SelectValue>
                    {(v) =>
                      !v || v === ALL
                        ? "All statuses"
                        : (STATUS_OPTIONS.find((s) => s.value === v)?.label ?? "Status")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
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
              {total} {total === 1 ? "thread" : "threads"}
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

      <DiscussionDetailSheet threadId={detailId} onOpenChange={(o) => !o && setDetailId(null)} />

      {/* Start a discussion (as staff, in any course) */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Start a discussion</DialogTitle>
            <DialogDescription>Post an announcement or question to a course.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Course</Label>
              <Select value={form.courseId} onValueChange={(v) => setForm((f) => ({ ...f, courseId: v ?? "" }))}>
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
              <Label htmlFor="d-title">Title</Label>
              <Input id="d-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Week 3 — live doubt session" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-body">Message</Label>
              <Textarea id="d-body" rows={4} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="Write your announcement or question…" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={creating || !form.courseId || form.title.trim().length < 3 || !form.body.trim()}>
                {creating && <Loader2 className="size-4 animate-spin" />}
                Post
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this discussion?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the thread and all its replies. This can&apos;t be undone.
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
