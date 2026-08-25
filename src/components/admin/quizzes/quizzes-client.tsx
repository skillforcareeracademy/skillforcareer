"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  FileQuestion,
  Send,
  Undo2,
  ListChecks,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
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

interface QuizRow {
  id: string;
  title: string;
  courseId: string | null;
  courseTitle: string | null;
  batchIds: string[];
  batchNames: string[];
  createdByName: string;
  passingScore: number;
  timeLimitMinutes: number | null;
  isPublished: boolean;
  questions: number;
  attempts: number;
}
interface Stats {
  total: number;
  published: number;
  draft: number;
  attempts: number;
}
interface Query {
  page: number;
  pageSize: number;
  search?: string;
  courseId?: string;
  batchId?: string;
  status?: string;
}
interface Opt {
  id: string;
  title: string;
}
interface BatchOpt {
  id: string;
  name: string;
  courseId: string;
  courseTitle: string;
}

const ALL = "all";
const STATUS_OPTIONS = [
  { value: "PUBLISHED", label: "Published" },
  { value: "DRAFT", label: "Draft" },
];

export function QuizzesClient({
  quizzes,
  total,
  query,
  stats,
  courses,
  batches,
  basePath = "/admin/quizzes",
}: {
  quizzes: QuizRow[];
  total: number;
  query: Query;
  stats: Stats;
  courses: Opt[];
  batches: BatchOpt[];
  basePath?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(query.search ?? "");
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCourse, setNewCourse] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<QuizRow | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const hasFilters = Boolean(
    query.search || query.courseId || query.batchId || query.status,
  );
  /** Picking a course narrows the batch filter to that course's cohorts. */
  const batchOptions = query.courseId
    ? batches.filter((b) => b.courseId === query.courseId)
    : batches;

  const setParams = useCallback(
    (next: Record<string, string | number | undefined>) => {
      const merged = {
        search: query.search,
        course: query.courseId,
        batch: query.batchId,
        status: query.status,
        page: query.page,
        ...next,
      };
      const p = new URLSearchParams();
      if (merged.search) p.set("search", String(merged.search));
      if (merged.course) p.set("course", String(merged.course));
      if (merged.batch) p.set("batch", String(merged.batch));
      if (merged.status) p.set("status", String(merged.status));
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
      course: undefined,
      batch: undefined,
      status: undefined,
      page: 1,
    });
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const { id } = await api.post<{ id: string }>("/api/quizzes", {
        title: newTitle,
        courseId: newCourse || undefined,
      });
      toast.success("Quiz created.");
      router.push(`${basePath}/${id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't create quiz.");
      setCreating(false);
    }
  }

  async function togglePublish(z: QuizRow) {
    const publish = !z.isPublished;
    try {
      await api.post(`/api/quizzes/${z.id}/publish`, { publish });
      toast.success(publish ? "Published." : "Unpublished.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed.");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/quizzes/${deleting.id}`);
      toast.success("Quiz deleted.");
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  const statCards = [
    { label: "Quizzes", value: stats.total, icon: FileQuestion, tone: "text-rose-500" },
    { label: "Published", value: stats.published, icon: Send, tone: "text-emerald-500" },
    { label: "Drafts", value: stats.draft, icon: Pencil, tone: "text-amber-500" },
    { label: "Attempts", value: stats.attempts, icon: Users, tone: "text-violet-500" },
  ];

  function statusBadge(z: QuizRow) {
    return z.isPublished ? (
      <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
        Published
      </Badge>
    ) : (
      <Badge variant="secondary" className="bg-muted text-muted-foreground">
        Draft
      </Badge>
    );
  }

  function rowActions(z: QuizRow) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />} aria-label="Actions">
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(`${basePath}/${z.id}`)}>
            <Pencil className="size-4" /> Edit &amp; questions
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => togglePublish(z)}>
            {z.isPublished ? (
              <>
                <Undo2 className="size-4" /> Unpublish
              </>
            ) : (
              <>
                <Send className="size-4" /> Publish
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleting(z)}
          >
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const columns: Column<QuizRow>[] = [
    {
      key: "title",
      header: "Quiz",
      cell: (z) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{z.title}</p>
          <p className="text-muted-foreground truncate text-xs">
            {z.courseTitle ?? "No course"} · {z.createdByName}
          </p>
        </div>
      ),
    },
    {
      key: "batches",
      header: "Set for",
      cell: (z) =>
        z.batchNames.length === 0 ? (
          <span className="text-muted-foreground text-sm">Whole course</span>
        ) : (
          <span className="flex max-w-[13rem] flex-wrap gap-1">
            {z.batchNames.slice(0, 2).map((name, i) => (
              <Badge
                key={name}
                variant="secondary"
                className="cursor-pointer text-[10px] font-normal"
                onClick={() => setParams({ batch: z.batchIds[i], page: 1 })}
              >
                {name}
              </Badge>
            ))}
            {z.batchNames.length > 2 && (
              <span className="text-muted-foreground text-xs">+{z.batchNames.length - 2}</span>
            )}
          </span>
        ),
    },
    {
      key: "questions",
      header: "Questions",
      className: "tabular-nums",
      cell: (z) => (
        <span className="flex items-center gap-1 text-sm">
          <ListChecks className="size-3.5 text-muted-foreground" /> {z.questions}
        </span>
      ),
    },
    { key: "pass", header: "Pass %", cell: (z) => `${z.passingScore}%`, className: "tabular-nums" },
    { key: "attempts", header: "Attempts", cell: (z) => z.attempts, className: "tabular-nums" },
    { key: "status", header: "Status", cell: statusBadge },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "w-10",
      cell: (z) => rowActions(z),
    },
  ];

  function renderCard(z: QuizRow) {
    return (
      <div className="rounded-xl border p-4">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => router.push(`${basePath}/${z.id}`)}
            className="min-w-0 flex-1 text-left"
          >
            <p className="truncate font-medium">{z.title}</p>
            <p className="text-muted-foreground truncate text-xs">
              {z.courseTitle ?? "No course"} · {z.createdByName}
            </p>
          </button>
          <div className="flex shrink-0 items-center gap-1">
            {statusBadge(z)}
            {rowActions(z)}
          </div>
        </div>
        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="flex items-center gap-1">
            <ListChecks className="size-3.5" /> {z.questions} questions
          </span>
          <span>Pass {z.passingScore}%</span>
          <span className="flex items-center gap-1">
            <Users className="size-3.5" /> {z.attempts}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quizzes"
        description="Create quizzes, build questions and track attempts."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New quiz
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
        data={quizzes}
        rowKey={(z) => z.id}
        renderCard={renderCard}
        emptyIcon={FileQuestion}
        emptyTitle={hasFilters ? "No matching quizzes" : "No quizzes yet"}
        emptyDescription={
          hasFilters ? "Try adjusting your search or filters." : "Create your first quiz to get started."
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
                placeholder="Search quizzes…"
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
                onValueChange={(v) =>
                  setParams({
                    course: !v || v === ALL ? undefined : v,
                    // A cohort from another course would filter everything out.
                    batch: undefined,
                    page: 1,
                  })
                }
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
              <Select
                value={query.batchId ?? ALL}
                onValueChange={(v) => setParams({ batch: !v || v === ALL ? undefined : v, page: 1 })}
              >
                <SelectTrigger className="flex-1 sm:w-44">
                  <SelectValue>
                    {(v) =>
                      !v || v === ALL
                        ? "All batches"
                        : (batches.find((b) => b.id === v)?.name ?? "Batch")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All batches</SelectItem>
                  {batchOptions.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
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
              {total} {total === 1 ? "quiz" : "quizzes"}
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

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New quiz</DialogTitle>
            <DialogDescription>Give it a title — add questions and settings next.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-quiz-title">Quiz title</Label>
              <Input
                id="new-quiz-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Python Fundamentals Quiz"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Course (optional)</Label>
              <Select value={newCourse} onValueChange={(v) => setNewCourse(v ?? "")}>
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating || newTitle.trim().length < 3}>
                {creating && <Loader2 className="size-4 animate-spin" />}
                Create &amp; edit
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
              This permanently removes the quiz, its questions and all attempts. This can&apos;t be undone.
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
