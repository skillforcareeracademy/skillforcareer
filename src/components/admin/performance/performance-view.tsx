"use client";

import { Users, Layers, GraduationCap, Star } from "lucide-react";
import type {
  StudentPerfRow,
  BatchPerfRow,
  InstructorPerfRow,
} from "@/server/services/analytics-service";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="bg-muted h-1.5 w-20 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full bg-gradient-to-r from-rose-500 to-pink-600"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className="text-muted-foreground w-9 text-right text-xs tabular-nums">{value}%</span>
    </div>
  );
}

function scoreLabel(v: number | null) {
  return v == null ? <span className="text-muted-foreground">—</span> : <span>{v}%</span>;
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

const TAB = "gap-1.5 px-3";

export function PerformanceView({
  students,
  batches,
  instructors,
  title = "Performance",
  description = "Learning outcomes across students, batches and instructors.",
}: {
  students: StudentPerfRow[];
  batches: BatchPerfRow[];
  instructors?: InstructorPerfRow[];
  title?: string;
  description?: string;
}) {
  const studentCols: Column<StudentPerfRow>[] = [
    {
      key: "name",
      header: "Student",
      cell: (s) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar className="size-8 shrink-0">
            {s.avatarUrl && <AvatarImage src={s.avatarUrl} alt={s.name} />}
            <AvatarFallback className="text-xs">{initials(s.name)}</AvatarFallback>
          </Avatar>
          <span className="truncate font-medium">{s.name}</span>
        </div>
      ),
    },
    { key: "courses", header: "Courses", className: "tabular-nums", cell: (s) => s.courses },
    { key: "progress", header: "Avg progress", cell: (s) => <ProgressBar value={s.avgProgress} /> },
    { key: "quiz", header: "Quiz avg", className: "tabular-nums", cell: (s) => scoreLabel(s.quizAvg) },
    { key: "asg", header: "Assignment avg", className: "tabular-nums", cell: (s) => scoreLabel(s.assignmentAvg) },
    { key: "done", header: "Completed", className: "tabular-nums", cell: (s) => s.completions },
    { key: "certs", header: "Certs", className: "tabular-nums", cell: (s) => s.certificates },
  ];

  const batchCols: Column<BatchPerfRow>[] = [
    {
      key: "name",
      header: "Batch",
      cell: (b) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{b.name}</p>
          <p className="text-muted-foreground truncate text-xs">{b.courseTitle ?? "—"}</p>
        </div>
      ),
    },
    { key: "learners", header: "Learners", className: "tabular-nums", cell: (b) => b.learners },
    { key: "progress", header: "Avg progress", cell: (b) => <ProgressBar value={b.avgProgress} /> },
    { key: "done", header: "Completed", className: "tabular-nums", cell: (b) => b.completions },
    {
      key: "status",
      header: "Status",
      cell: (b) => (
        <Badge variant="secondary" className="text-xs">
          {b.status.charAt(0) + b.status.slice(1).toLowerCase()}
        </Badge>
      ),
    },
  ];

  const instructorCols: Column<InstructorPerfRow>[] = [
    {
      key: "name",
      header: "Instructor",
      cell: (i) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar className="size-8 shrink-0">
            {i.avatarUrl && <AvatarImage src={i.avatarUrl} alt={i.name} />}
            <AvatarFallback className="text-xs">{initials(i.name)}</AvatarFallback>
          </Avatar>
          <span className="truncate font-medium">{i.name}</span>
        </div>
      ),
    },
    { key: "courses", header: "Courses", className: "tabular-nums", cell: (i) => i.courses },
    { key: "students", header: "Students", className: "tabular-nums", cell: (i) => i.students },
    {
      key: "rating",
      header: "Avg rating",
      cell: (i) =>
        i.avgRating > 0 ? (
          <span className="flex items-center gap-1">
            <Star className="size-3.5 fill-amber-400 text-amber-400" /> {i.avgRating.toFixed(1)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { key: "revenue", header: "Revenue", className: "tabular-nums", cell: (i) => inr(i.revenue) },
    { key: "done", header: "Completions", className: "tabular-nums", cell: (i) => i.completions },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />

      <Tabs defaultValue="students">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="students" className={TAB}>
            <Users className="size-4" /> Students
          </TabsTrigger>
          <TabsTrigger value="batches" className={TAB}>
            <Layers className="size-4" /> Batches
          </TabsTrigger>
          {instructors && (
            <TabsTrigger value="instructors" className={TAB}>
              <GraduationCap className="size-4" /> Instructors
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="students" className="mt-4">
          <DataTable
            data={students}
            columns={studentCols}
            rowKey={(s) => s.id}
            emptyIcon={Users}
            emptyTitle="No student data yet"
            emptyDescription="Performance appears once learners enrol and make progress."
            renderCard={(s) => (
              <div className="rounded-xl border p-4">
                <div className="flex items-center gap-2.5">
                  <Avatar className="size-8">
                    {s.avatarUrl && <AvatarImage src={s.avatarUrl} alt={s.name} />}
                    <AvatarFallback className="text-xs">{initials(s.name)}</AvatarFallback>
                  </Avatar>
                  <span className="truncate font-medium">{s.name}</span>
                </div>
                <div className="mt-3"><ProgressBar value={s.avgProgress} /></div>
                <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <span>{s.courses} courses</span>
                  <span>Quiz {s.quizAvg ?? "—"}{s.quizAvg != null ? "%" : ""}</span>
                  <span>Assign {s.assignmentAvg ?? "—"}{s.assignmentAvg != null ? "%" : ""}</span>
                  <span>{s.certificates} certs</span>
                </div>
              </div>
            )}
          />
        </TabsContent>

        <TabsContent value="batches" className="mt-4">
          <DataTable
            data={batches}
            columns={batchCols}
            rowKey={(b) => b.id}
            emptyIcon={Layers}
            emptyTitle="No batches yet"
            renderCard={(b) => (
              <div className="rounded-xl border p-4">
                <p className="font-medium">{b.name}</p>
                <p className="text-muted-foreground text-xs">{b.courseTitle ?? "—"}</p>
                <div className="mt-3"><ProgressBar value={b.avgProgress} /></div>
                <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 text-xs">
                  <span>{b.learners} learners</span>
                  <span>{b.completions} completed</span>
                </div>
              </div>
            )}
          />
        </TabsContent>

        {instructors && (
          <TabsContent value="instructors" className="mt-4">
            <DataTable
              data={instructors}
              columns={instructorCols}
              rowKey={(i) => i.id}
              emptyIcon={GraduationCap}
              emptyTitle="No instructor data yet"
              renderCard={(i) => (
                <div className="rounded-xl border p-4">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-8">
                      {i.avatarUrl && <AvatarImage src={i.avatarUrl} alt={i.name} />}
                      <AvatarFallback className="text-xs">{initials(i.name)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate font-medium">{i.name}</span>
                  </div>
                  <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span>{i.courses} courses</span>
                    <span>{i.students} students</span>
                    <span>{inr(i.revenue)}</span>
                    <span>★ {i.avgRating || "—"}</span>
                  </div>
                </div>
              )}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
