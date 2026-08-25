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
  ClipboardList,
  CalendarClock,
  FileCheck2,
  Hourglass,
  X,
  Eye,
  Users,
  Award,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
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
import { AssignmentDetailSheet } from "@/components/admin/assignments/assignment-detail-sheet";
import { AssignmentQuestionsSheet } from "@/components/admin/assignments/assignment-questions-sheet";
import { AudiencePicker } from "@/components/shared/audience-picker";
import {
  ASSIGNMENT_TYPES,
  ASSIGNMENT_TYPE_LABEL,
  ASSIGNMENT_GRADING_MODES,
  ASSIGNMENT_GRADING_MODE_LABEL,
} from "@/lib/validations/assignment";

interface AssignmentRow {
  id: string;
  title: string;
  type: string;
  gradingMode: string;
  courseId: string | null;
  courseTitle: string | null;
  batchIds: string[];
  batchNames: string[];
  createdByName: string;
  maxScore: number;
  dueDate: string | null;
  isOverdue: boolean;
  allowLate: boolean;
  submissions: number;
  needsGrading: number;
}
interface Stats {
  total: number;
  upcoming: number;
  submissions: number;
  needsGrading: number;
}
interface Query {
  page: number;
  pageSize: number;
  search?: string;
  courseId?: string;
  batchId?: string;
  type?: string;
  dueFrom?: string;
  dueTo?: string;
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
interface StudentOpt {
  id: string;
  name: string;
  email: string;
}

const ALL = "all";
const NONE = "none";

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtDue(iso: string | null): string {
  return iso ? format(new Date(iso), "d MMM yyyy, h:mm a") : "No due date";
}

interface FormState {
  title: string;
  description: string;
  instructions: string;
  courseId: string;
  type: string;
  gradingMode: string;
  maxScore: string;
  dueDate: string;
  allowLate: boolean;
  batchIds: string[];
  studentIds: string[];
}
const EMPTY: FormState = {
  title: "",
  description: "",
  instructions: "",
  courseId: "",
  type: "FILE",
  gradingMode: "MANUAL",
  maxScore: "100",
  dueDate: "",
  allowLate: false,
  batchIds: [],
  studentIds: [],
};
/**
 * Prefill from the row while the full record loads. The list carries enough for
 * the dialog to open populated; description, instructions and the individual
 * learners come from the detail fetch a moment later.
 */
function fromRow(a: AssignmentRow): FormState {
  return {
    title: a.title,
    description: "",
    instructions: "",
    courseId: a.courseId ?? "",
    type: a.type,
    gradingMode: a.gradingMode,
    maxScore: String(a.maxScore),
    dueDate: a.dueDate ? toLocalInput(a.dueDate) : "",
    allowLate: a.allowLate,
    batchIds: a.batchIds,
    studentIds: [],
  };
}

export function AssignmentsClient({
  assignments,
  total,
  query,
  stats,
  courses,
  batches,
  students,
  canExport = true,
}: {
  assignments: AssignmentRow[];
  total: number;
  query: Query;
  stats: Stats;
  courses: Opt[];
  batches: BatchOpt[];
  students: StudentOpt[];
  /** Instructors may import a question paper but not download the answer key. */
  canExport?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(query.search ?? "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AssignmentRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<AssignmentRow | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [questionsFor, setQuestionsFor] = useState<AssignmentRow | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const hasFilters = Boolean(
    query.search || query.courseId || query.batchId || query.type || query.dueFrom || query.dueTo,
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
        type: query.type,
        from: query.dueFrom,
        to: query.dueTo,
        page: query.page,
        ...next,
      };
      const p = new URLSearchParams();
      if (merged.search) p.set("search", String(merged.search));
      if (merged.course) p.set("course", String(merged.course));
      if (merged.batch) p.set("batch", String(merged.batch));
      if (merged.type) p.set("type", String(merged.type));
      if (merged.from) p.set("from", String(merged.from));
      if (merged.to) p.set("to", String(merged.to));
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
      type: undefined,
      from: undefined,
      to: undefined,
      page: 1,
    });
  }
  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Switching course invalidates cohorts picked from the previous one.
      if (key === "courseId") {
        next.batchIds = prev.batchIds.filter(
          (id) => batches.find((b) => b.id === id)?.courseId === value,
        );
      }
      return next;
    });
  }
  /** Cohorts of the course chosen in the dialog. */
  const formBatches = form.courseId
    ? batches.filter((b) => b.courseId === form.courseId)
    : batches;

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setDialogOpen(true);
  }
  /**
   * Open the editor straight away on what the list already knows, then fill in
   * the long fields and the individually-set learners once they arrive — so the
   * dialog never sits blank waiting on a round-trip.
   */
  function openEdit(a: AssignmentRow) {
    setEditing(a);
    setForm(fromRow(a));
    setDialogOpen(true);
    setLoadingDetail(true);
    api
      .get<{
        description: string | null;
        instructions: string | null;
        students: { id: string }[];
      }>(`/api/assignments/${a.id}`)
      .then((d) =>
        setForm((f) => ({
          ...f,
          description: d.description ?? "",
          instructions: d.instructions ?? "",
          studentIds: d.students.map((s) => s.id),
        })),
      )
      .catch(() => {})
      .finally(() => setLoadingDetail(false));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      title: form.title,
      description: form.description || undefined,
      instructions: form.instructions || undefined,
      courseId: form.courseId || undefined,
      type: form.type,
      gradingMode: form.gradingMode,
      maxScore: Number(form.maxScore) || 100,
      dueDate: form.dueDate || undefined,
      allowLate: form.allowLate,
      batchIds: form.batchIds,
      studentIds: form.studentIds,
    };
    try {
      if (editing) {
        await api.patch(`/api/assignments/${editing.id}`, payload);
        toast.success("Assignment updated.");
      } else {
        await api.post("/api/assignments", payload);
        toast.success("Assignment created.");
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
      await api.del(`/api/assignments/${deleting.id}`);
      toast.success("Assignment deleted.");
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  const statCards = [
    { label: "Assignments", value: stats.total, icon: ClipboardList, tone: "text-rose-500" },
    { label: "Upcoming due", value: stats.upcoming, icon: CalendarClock, tone: "text-sky-500" },
    { label: "Submissions", value: stats.submissions, icon: FileCheck2, tone: "text-violet-500" },
    { label: "Needs grading", value: stats.needsGrading, icon: Hourglass, tone: "text-amber-500" },
  ];

  function rowActions(a: AssignmentRow) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />} aria-label="Actions">
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDetailId(a.id)}>
            <Eye className="size-4" /> View &amp; grade
          </DropdownMenuItem>
          {a.type !== "FILE" && (
            <DropdownMenuItem onClick={() => setQuestionsFor(a)}>
              <ListChecks className="size-4" /> Questions
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => openEdit(a)}>
            <Pencil className="size-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleting(a)}
          >
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function submissionsCell(a: AssignmentRow) {
    return (
      <span className="flex items-center gap-2 text-sm">
        <span className="flex items-center gap-1 tabular-nums">
          <Users className="size-3.5 text-muted-foreground" /> {a.submissions}
        </span>
        {a.needsGrading > 0 && (
          <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            {a.needsGrading} to grade
          </Badge>
        )}
      </span>
    );
  }

  const columns: Column<AssignmentRow>[] = [
    {
      key: "title",
      header: "Assignment",
      cell: (a) => (
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate font-medium">
            <span className="truncate">{a.title}</span>
            {a.type !== "FILE" && (
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {a.type}
              </Badge>
            )}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {a.courseTitle ?? "No course"} · {a.createdByName}
          </p>
        </div>
      ),
    },
    {
      key: "batches",
      header: "Set for",
      cell: (a) =>
        a.batchNames.length === 0 ? (
          <span className="text-muted-foreground text-sm">Whole course</span>
        ) : (
          <span className="flex max-w-[13rem] flex-wrap gap-1">
            {a.batchNames.slice(0, 2).map((name, i) => (
              <Badge
                key={name}
                variant="secondary"
                className="cursor-pointer text-[10px] font-normal"
                onClick={() => setParams({ batch: a.batchIds[i], page: 1 })}
              >
                {name}
              </Badge>
            ))}
            {a.batchNames.length > 2 && (
              <span className="text-muted-foreground text-xs">
                +{a.batchNames.length - 2}
              </span>
            )}
          </span>
        ),
    },
    {
      key: "due",
      header: "Due",
      cell: (a) => (
        <span
          className={
            a.dueDate
              ? a.isOverdue
                ? "text-sm whitespace-nowrap text-rose-600"
                : "text-sm whitespace-nowrap"
              : "text-muted-foreground text-sm"
          }
        >
          {a.dueDate ? format(new Date(a.dueDate), "d MMM yyyy") : "—"}
        </span>
      ),
    },
    { key: "maxScore", header: "Max", cell: (a) => a.maxScore, className: "tabular-nums" },
    { key: "submissions", header: "Submissions", cell: submissionsCell },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "w-10",
      cell: (a) => rowActions(a),
    },
  ];

  function renderCard(a: AssignmentRow) {
    return (
      <div className="rounded-xl border p-4">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => setDetailId(a.id)}
            className="min-w-0 flex-1 text-left"
          >
            <p className="truncate font-medium">{a.title}</p>
            <p className="text-muted-foreground truncate text-xs">
              {a.courseTitle ?? "No course"} · {a.createdByName}
            </p>
          </button>
          {rowActions(a)}
        </div>
        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="flex items-center gap-1">
            <CalendarClock className="size-3.5" /> {fmtDue(a.dueDate)}
          </span>
          <span className="flex items-center gap-1">
            <Award className="size-3.5" /> {a.maxScore} pts
          </span>
        </div>
        <div className="mt-2">{submissionsCell(a)}</div>
      </div>
    );
  }

  const canSave = form.title.trim().length >= 3 && Number(form.maxScore) >= 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assignments"
        description="Create assignments, track submissions and grade your learners."
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" /> New assignment
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
        data={assignments}
        rowKey={(a) => a.id}
        renderCard={renderCard}
        emptyIcon={ClipboardList}
        emptyTitle={hasFilters ? "No matching assignments" : "No assignments yet"}
        emptyDescription={
          hasFilters ? "Try adjusting your search or filters." : "Create your first assignment to get started."
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
                placeholder="Search assignments…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </form>
            <div className="flex flex-wrap gap-2">
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
                <SelectTrigger className="w-44">
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
                <SelectTrigger className="w-40">
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
                value={query.type ?? ALL}
                onValueChange={(v) => setParams({ type: !v || v === ALL ? undefined : v, page: 1 })}
              >
                <SelectTrigger className="w-36">
                  <SelectValue>
                    {(v) => (!v || v === ALL ? "All types" : ASSIGNMENT_TYPE_LABEL[String(v)])}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All types</SelectItem>
                  {ASSIGNMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ASSIGNMENT_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Due-date window — "what's due this week" is the question the
                  admin team actually asks of this page. */}
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  aria-label="Due on or after"
                  className="w-[9.5rem]"
                  value={query.dueFrom ?? ""}
                  onChange={(e) => setParams({ from: e.target.value || undefined, page: 1 })}
                />
                <span className="text-muted-foreground text-sm">to</span>
                <Input
                  type="date"
                  aria-label="Due on or before"
                  className="w-[9.5rem]"
                  value={query.dueTo ?? ""}
                  onChange={(e) => setParams({ to: e.target.value || undefined, page: 1 })}
                />
              </div>
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
              {total} {total === 1 ? "assignment" : "assignments"}
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
            <DialogTitle>{editing ? "Edit assignment" : "New assignment"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update this assignment." : "Create an assignment for a course."}
              {loadingDetail && (
                <span className="text-muted-foreground ml-2 inline-flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" /> loading details…
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="a-title">Title</Label>
              <Input
                id="a-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Build a REST API with Node"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-desc">Short description</Label>
              <Input
                id="a-desc"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="One-line summary (optional)"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-inst">Instructions</Label>
              <Textarea
                id="a-inst"
                rows={3}
                value={form.instructions}
                onChange={(e) => set("instructions", e.target.value)}
                placeholder="What should learners do and submit? (optional)"
              />
            </div>

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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Assignment type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => {
                    if (!v) return;
                    // Written answers can only be marked by a person.
                    set("type", v);
                    if (v === "QNA") set("gradingMode", "MANUAL");
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => ASSIGNMENT_TYPE_LABEL[String(v)]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {ASSIGNMENT_TYPE_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Marking</Label>
                <Select
                  value={form.gradingMode}
                  onValueChange={(v) => v && set("gradingMode", v)}
                  disabled={form.type === "QNA"}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => ASSIGNMENT_GRADING_MODE_LABEL[String(v)]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNMENT_GRADING_MODES.map((g) => (
                      <SelectItem key={g} value={g}>
                        {ASSIGNMENT_GRADING_MODE_LABEL[g]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.type !== "FILE" && (
              <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-xs">
                {editing
                  ? "Add the questions from the row menu — Questions."
                  : "Create the assignment first, then add its questions from the row menu."}
                {form.type === "MCQ"
                  ? " Multiple-choice answers are marked automatically."
                  : " Written answers are marked by hand against the model answer you set."}
              </p>
            )}

            {/* Who it's set for. Nothing chosen = the whole course, which is how
                assignments behaved before cohorts could be named. */}
            <AudiencePicker
              label="Batches"
              emptyMeans="No batch chosen — everyone on the course gets it."
              searchPlaceholder="Search batches…"
              options={formBatches.map((b) => ({
                id: b.id,
                label: b.name,
                hint: b.courseTitle,
              }))}
              selected={form.batchIds}
              onChange={(ids) => set("batchIds", ids)}
              maxHeight="12rem"
            />

            <AudiencePicker
              label="Additional students"
              emptyMeans="Nobody added individually."
              searchPlaceholder="Search learners…"
              options={students.map((st) => ({ id: st.id, label: st.name, hint: st.email }))}
              selected={form.studentIds}
              onChange={(ids) => set("studentIds", ids)}
              maxHeight="12rem"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="a-max">Max score</Label>
                <Input
                  id="a-max"
                  type="number"
                  min={1}
                  value={form.maxScore}
                  onChange={(e) => set("maxScore", e.target.value)}
                  disabled={form.type !== "FILE"}
                />
                {form.type !== "FILE" && (
                  <p className="text-muted-foreground text-xs">
                    Set from the questions&apos; total points.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="a-due">Due date</Label>
                <Input
                  id="a-due"
                  type="datetime-local"
                  value={form.dueDate}
                  onChange={(e) => set("dueDate", e.target.value)}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.allowLate}
                onCheckedChange={(v) => set("allowLate", v)}
              />
              Allow late submissions
            </label>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSave || saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {editing ? "Save changes" : "Create assignment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AssignmentDetailSheet assignmentId={detailId} onOpenChange={(o) => !o && setDetailId(null)} />

      <AssignmentQuestionsSheet
        assignment={questionsFor}
        canExport={canExport}
        onOpenChange={(o) => !o && setQuestionsFor(null)}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the assignment and all its submissions. This can&apos;t be undone.
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
