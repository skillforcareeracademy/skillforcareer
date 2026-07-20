"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Send,
  Undo2,
  Loader2,
  BookOpen,
  Users,
  GraduationCap,
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

interface CourseRow {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  status: string;
  level: string;
  thumbnailUrl: string | null;
  categoryName: string;
  instructorName: string;
  price: number;
  discountPrice: number | null;
  pricingType: string;
  enrollments: number;
  chapters: number;
  updatedAt: string;
}

interface Stats {
  total: number;
  published: number;
  draft: number;
  pendingReview: number;
  enrollments: number;
}

interface Query {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  categoryId?: string;
}

const STATUS_BADGE: Record<string, string> = {
  PUBLISHED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  DRAFT: "bg-muted text-muted-foreground",
  PENDING_REVIEW: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  ARCHIVED: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};
const STATUS_OPTIONS = ["DRAFT", "PENDING_REVIEW", "PUBLISHED", "ARCHIVED"];
const LEVEL_LABEL: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};
const ALL = "all";
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const pretty = (s: string) =>
  s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

export function CoursesClient({
  courses,
  total,
  query,
  stats,
  categories,
  basePath = "/admin/courses",
  canDelete = true,
}: {
  courses: CourseRow[];
  total: number;
  query: Query;
  stats: Stats;
  categories: { id: string; name: string }[];
  /** Route prefix for row/create navigation — `/instructor/courses` in the instructor workspace. */
  basePath?: string;
  /** Instructors can't delete courses (admins only) — hide the action. */
  canDelete?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(query.search ?? "");
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<CourseRow | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const hasFilters = Boolean(query.search || query.status || query.categoryId);

  const setParams = useCallback(
    (next: Record<string, string | number | undefined>) => {
      const merged = {
        search: query.search,
        status: query.status,
        category: query.categoryId,
        page: query.page,
        ...next,
      };
      const p = new URLSearchParams();
      if (merged.search) p.set("search", String(merged.search));
      if (merged.status) p.set("status", String(merged.status));
      if (merged.category) p.set("category", String(merged.category));
      if (merged.page && Number(merged.page) > 1) p.set("page", String(merged.page));
      const qs = p.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, query],
  );

  function clearFilters() {
    setSearch("");
    setParams({ search: undefined, status: undefined, category: undefined, page: 1 });
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const { id } = await api.post<{ id: string }>("/api/courses", {
        title: newTitle,
        categoryId: newCategory,
      });
      toast.success("Course created.");
      router.push(`${basePath}/${id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't create course.");
      setCreating(false);
    }
  }

  async function togglePublish(c: CourseRow) {
    const publish = c.status !== "PUBLISHED";
    try {
      await api.post(`/api/courses/${c.id}/publish`, { publish });
      toast.success(publish ? "Published." : "Unpublished.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed.");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/courses/${deleting.id}`);
      toast.success("Course deleted.");
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  const statCards = [
    { label: "Total courses", value: stats.total, icon: BookOpen, tone: "text-rose-500" },
    { label: "Published", value: stats.published, icon: Send, tone: "text-emerald-500" },
    {
      label: "Drafts & review",
      value: stats.draft + stats.pendingReview,
      icon: Pencil,
      tone: "text-amber-500",
    },
    { label: "Enrolments", value: stats.enrollments, icon: Users, tone: "text-sky-500" },
  ];

  const columns: Column<CourseRow>[] = [
    {
      key: "title",
      header: "Course",
      cell: (c) => (
        <div className="flex min-w-0 items-center gap-3">
          <div className="ring-border relative h-10 w-16 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-rose-500/15 to-pink-600/15 ring-1">
            {c.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.thumbnailUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="grid h-full w-full place-items-center">
                <BookOpen className="size-4 text-rose-500/70" />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{c.title}</p>
            <p className="text-muted-foreground truncate text-xs">
              {c.categoryName} · {c.instructorName}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (c) => (
        <Badge variant="secondary" className={STATUS_BADGE[c.status]}>
          {pretty(c.status)}
        </Badge>
      ),
    },
    {
      key: "level",
      header: "Level",
      cell: (c) => (
        <span className="text-muted-foreground text-sm">
          {LEVEL_LABEL[c.level] ?? c.level}
        </span>
      ),
    },
    { key: "chapters", header: "Chapters", cell: (c) => c.chapters, className: "tabular-nums" },
    { key: "enrollments", header: "Enrolments", cell: (c) => c.enrollments, className: "tabular-nums" },
    {
      key: "price",
      header: "Price",
      className: "tabular-nums",
      cell: (c) =>
        c.pricingType === "FREE" ? (
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            Free
          </Badge>
        ) : c.discountPrice != null ? (
          <div className="leading-tight">
            <span className="font-medium">{inr(c.discountPrice)}</span>{" "}
            <span className="text-muted-foreground text-xs line-through">{inr(c.price)}</span>
          </div>
        ) : (
          inr(c.price)
        ),
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
            <DropdownMenuItem onClick={() => router.push(`${basePath}/${c.id}`)}>
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => togglePublish(c)}>
              {c.status === "PUBLISHED" ? (
                <>
                  <Undo2 className="size-4" /> Unpublish
                </>
              ) : (
                <>
                  <Send className="size-4" /> Publish
                </>
              )}
            </DropdownMenuItem>
            {canDelete && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleting(c)}
              >
                <Trash2 className="size-4" /> Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Courses"
        description="Create, organise and publish your course catalog."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New course
          </Button>
        }
      />

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="bg-muted grid size-10 shrink-0 place-items-center rounded-lg">
                <s.icon className={`size-5 ${s.tone}`} />
              </div>
              <div>
                <p className="text-2xl font-semibold leading-none tabular-nums">
                  {s.value.toLocaleString("en-IN")}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={courses}
        rowKey={(c) => c.id}
        emptyTitle={hasFilters ? "No matching courses" : "No courses yet"}
        emptyDescription={
          hasFilters
            ? "Try adjusting your search or filters."
            : "Create your first course to get started."
        }
        emptyIcon={GraduationCap}
        toolbar={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setParams({ search: search || undefined, page: 1 });
              }}
              className="max-w-xs flex-1"
            >
              <Input
                placeholder="Search courses…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </form>
            <Select
              value={query.status ?? ALL}
              onValueChange={(v) => setParams({ status: !v || v === ALL ? undefined : v, page: 1 })}
            >
              <SelectTrigger className="w-40">
                <SelectValue>
                  {(v) => (!v || v === ALL ? "All statuses" : pretty(String(v)))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {pretty(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={query.categoryId ?? ALL}
              onValueChange={(v) => setParams({ category: !v || v === ALL ? undefined : v, page: 1 })}
            >
              <SelectTrigger className="w-44">
                <SelectValue>
                  {(v) =>
                    !v || v === ALL
                      ? "All categories"
                      : (categories.find((c) => c.id === v)?.name ?? "Category")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
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
        }
        footer={
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              {total} {total === 1 ? "course" : "courses"}
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
            <DialogTitle>New course</DialogTitle>
            <DialogDescription>
              Give it a title and category — you can flesh out the rest next.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-title">Course title</Label>
              <Input
                id="new-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Complete Data Science Bootcamp"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={newCategory} onValueChange={(v) => setNewCategory(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a category">
                    {(v) => categories.find((c) => c.id === v)?.name ?? "Choose a category"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating || newTitle.length < 3 || !newCategory}>
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
              This permanently removes the course and its curriculum. Courses with
              enrolments can&apos;t be deleted.
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
