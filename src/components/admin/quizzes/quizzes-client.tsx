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
  ArrowUp,
  ArrowDown,
  FolderTree,
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
import { QuizCategoriesDialog } from "@/components/admin/quizzes/quiz-categories-dialog";
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
  sequence: number;
  courseId: string | null;
  courseTitle: string | null;
  categoryId: string | null;
  categoryName: string | null;
  subCategoryId: string | null;
  subCategoryName: string | null;
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
  categoryId?: string;
  subCategoryId?: string;
  sort?: string;
}
interface CategoryOpt {
  id: string;
  name: string;
  parentId: string | null;
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
/** Filter value for quizzes nobody has grouped yet — matches the service. */
const UNGROUPED = "none";
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
  categories = [],
  basePath = "/admin/quizzes",
}: {
  quizzes: QuizRow[];
  total: number;
  query: Query;
  stats: Stats;
  courses: Opt[];
  batches: BatchOpt[];
  /** Quiz groups: parents, and sub-categories carrying their `parentId`. */
  categories?: CategoryOpt[];
  basePath?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(query.search ?? "");
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCourse, setNewCourse] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newSubCategory, setNewSubCategory] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<QuizRow | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [moving, setMoving] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const hasFilters = Boolean(
    query.search ||
      query.courseId ||
      query.batchId ||
      query.status ||
      query.categoryId ||
      query.subCategoryId,
  );
  const parentCategories = categories.filter((c) => !c.parentId);
  const subCategories = categories.filter((c) => c.parentId === query.categoryId);
  const formSubCategories = categories.filter((c) => c.parentId === newCategory);
  /** Numbering is per group, so only neighbours in the same group can swap. */
  const inSameGroup = (a: QuizRow, b: QuizRow) =>
    a.categoryId === b.categoryId && a.subCategoryId === b.subCategoryId;
  const bySequence = query.sort !== "recent";
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
        category: query.categoryId,
        sub: query.subCategoryId,
        sort: query.sort,
        page: query.page,
        ...next,
      };
      const p = new URLSearchParams();
      if (merged.search) p.set("search", String(merged.search));
      if (merged.course) p.set("course", String(merged.course));
      if (merged.batch) p.set("batch", String(merged.batch));
      if (merged.status) p.set("status", String(merged.status));
      if (merged.category) p.set("category", String(merged.category));
      if (merged.sub) p.set("sub", String(merged.sub));
      if (merged.sort) p.set("sort", String(merged.sort));
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
      category: undefined,
      sub: undefined,
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
        categoryId: newCategory || undefined,
        subCategoryId: newSubCategory || undefined,
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

  /**
   * Swap a quiz with its neighbour and renumber the group. The whole visible
   * group goes up in one request, so the numbers in the table are the numbers
   * in the database even if two people are reordering at once.
   */
  async function move(index: number, delta: number) {
    const to = index + delta;
    if (to < 0 || to >= quizzes.length || moving) return;
    if (!inSameGroup(quizzes[index], quizzes[to])) return;

    const group = quizzes.filter((z) => inSameGroup(z, quizzes[index]));
    const from = group.findIndex((z) => z.id === quizzes[index].id);
    const target = group.findIndex((z) => z.id === quizzes[to].id);
    const ids = group.map((z) => z.id);
    [ids[from], ids[target]] = [ids[target], ids[from]];

    setMoving(true);
    try {
      await api.patch("/api/quizzes/reorder", { ids });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't reorder.");
    } finally {
      setMoving(false);
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
      key: "sequence",
      header: "#",
      headerClassName: "w-20",
      cell: (z) => {
        const i = quizzes.indexOf(z);
        const upTo = i - 1;
        const downTo = i + 1;
        return (
          <div className="flex items-center gap-0.5">
            <span className="text-muted-foreground w-5 text-sm tabular-nums">{z.sequence}</span>
            {bySequence && (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={moving || upTo < 0 || !inSameGroup(z, quizzes[upTo])}
                  onClick={() => move(i, -1)}
                  aria-label={`Move ${z.title} up`}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={moving || downTo >= quizzes.length || !inSameGroup(z, quizzes[downTo])}
                  onClick={() => move(i, 1)}
                  aria-label={`Move ${z.title} down`}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
              </>
            )}
          </div>
        );
      },
    },
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
      key: "group",
      header: "Group",
      cell: (z) =>
        z.categoryName ? (
          <span className="flex max-w-[12rem] flex-wrap gap-1">
            <Badge
              variant="secondary"
              className="cursor-pointer text-[10px] font-normal"
              onClick={() => setParams({ category: z.categoryId ?? undefined, sub: undefined, page: 1 })}
            >
              {z.categoryName}
            </Badge>
            {z.subCategoryName && (
              <Badge
                variant="secondary"
                className="cursor-pointer text-[10px] font-normal"
                onClick={() =>
                  setParams({
                    category: z.categoryId ?? undefined,
                    sub: z.subCategoryId ?? undefined,
                    page: 1,
                  })
                }
              >
                {z.subCategoryName}
              </Badge>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">Ungrouped</span>
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
            <p className="truncate font-medium">
              {z.sequence > 0 && <span className="text-muted-foreground">{z.sequence}. </span>}
              {z.title}
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {z.categoryName
                ? `${z.categoryName}${z.subCategoryName ? ` · ${z.subCategoryName}` : ""}`
                : z.courseTitle ?? "No course"}{" "}
              · {z.createdByName}
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
          {bySequence && (
            <span className="ml-auto flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                disabled={moving || quizzes.indexOf(z) === 0 || !inSameGroup(z, quizzes[quizzes.indexOf(z) - 1])}
                onClick={() => move(quizzes.indexOf(z), -1)}
                aria-label={`Move ${z.title} up`}
              >
                <ArrowUp className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={
                  moving ||
                  quizzes.indexOf(z) === quizzes.length - 1 ||
                  !inSameGroup(z, quizzes[quizzes.indexOf(z) + 1])
                }
                onClick={() => move(quizzes.indexOf(z), 1)}
                aria-label={`Move ${z.title} down`}
              >
                <ArrowDown className="size-3.5" />
              </Button>
            </span>
          )}
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
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setGroupsOpen(true)}>
              <FolderTree className="size-4" /> Groups
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> New quiz
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
              <Select
                value={query.categoryId ?? ALL}
                onValueChange={(v) =>
                  setParams({
                    category: !v || v === ALL ? undefined : v,
                    // A sub-category of another category filters out everything.
                    sub: undefined,
                    page: 1,
                  })
                }
              >
                <SelectTrigger className="flex-1 sm:w-44">
                  <SelectValue>
                    {(v) =>
                      !v || v === ALL
                        ? "All categories"
                        : v === UNGROUPED
                          ? "Ungrouped"
                          : (categories.find((c) => c.id === v)?.name ?? "Category")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All categories</SelectItem>
                  <SelectItem value={UNGROUPED}>Ungrouped</SelectItem>
                  {parentCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {subCategories.length > 0 && (
                <Select
                  value={query.subCategoryId ?? ALL}
                  onValueChange={(v) => setParams({ sub: !v || v === ALL ? undefined : v, page: 1 })}
                >
                  <SelectTrigger className="flex-1 sm:w-40">
                    <SelectValue>
                      {(v) =>
                        !v || v === ALL
                          ? "All sub-categories"
                          : (categories.find((c) => c.id === v)?.name ?? "Sub-category")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All sub-categories</SelectItem>
                    {subCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select
                value={query.sort ?? "sequence"}
                onValueChange={(v) =>
                  setParams({ sort: !v || v === "sequence" ? undefined : v, page: 1 })
                }
              >
                <SelectTrigger className="flex-1 sm:w-40">
                  <SelectValue>
                    {(v) => (v === "recent" ? "Recently edited" : "In sequence")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequence">In sequence</SelectItem>
                  <SelectItem value="recent">Recently edited</SelectItem>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={newCategory || "none"}
                  onValueChange={(v) => {
                    setNewCategory(v === "none" ? "" : (v ?? ""));
                    setNewSubCategory("");
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) =>
                        !v || v === "none"
                          ? "Ungrouped"
                          : (parentCategories.find((c) => c.id === v)?.name ?? "Ungrouped")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ungrouped</SelectItem>
                    {parentCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sub-category</Label>
                <Select
                  value={newSubCategory || "none"}
                  onValueChange={(v) => setNewSubCategory(v === "none" ? "" : (v ?? ""))}
                  disabled={formSubCategories.length === 0}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) =>
                        !v || v === "none"
                          ? formSubCategories.length === 0
                            ? "None available"
                            : "None"
                          : (formSubCategories.find((c) => c.id === v)?.name ?? "None")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {formSubCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              The quiz is numbered automatically inside its group — use{" "}
              <strong>Groups</strong> to add categories, and the arrows in the list to reorder.
            </p>
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

      <QuizCategoriesDialog open={groupsOpen} onOpenChange={setGroupsOpen} />

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
