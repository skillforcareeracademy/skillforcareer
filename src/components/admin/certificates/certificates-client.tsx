"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { format } from "date-fns";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Loader2,
  Award,
  BadgeCheck,
  Ban,
  Users,
  Eye,
  RotateCcw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { CERTIFICATE_STATUSES, CERTIFICATE_STATUS_LABEL } from "@/lib/validations/certificate";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  CertificateDetailSheet,
  type CertRow,
} from "@/components/admin/certificates/certificate-detail-sheet";

interface Stats {
  total: number;
  active: number;
  revoked: number;
  recipients: number;
}
interface Query {
  page: number;
  pageSize: number;
  search?: string;
  courseId?: string;
  status?: string;
}
interface UserOpt {
  id: string;
  name: string;
  email: string;
}
interface CourseOpt {
  id: string;
  title: string;
}

const ALL = "all";

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function CertificatesClient({
  certificates,
  total,
  query,
  stats,
  users,
  courses,
  canManage = true,
  title = "Certificates",
  description = "Issue, verify and manage course completion certificates.",
}: {
  certificates: CertRow[];
  total: number;
  query: Query;
  stats: Stats;
  users: UserOpt[];
  courses: CourseOpt[];
  /** Instructors get a read-only view (no issue/revoke/delete). */
  canManage?: boolean;
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(query.search ?? "");
  const [issueOpen, setIssueOpen] = useState(false);
  const [newUser, setNewUser] = useState("");
  const [newCourse, setNewCourse] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [deleting, setDeleting] = useState<CertRow | null>(null);
  const [detail, setDetail] = useState<CertRow | null>(null);

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

  async function onIssue(e: FormEvent) {
    e.preventDefault();
    setIssuing(true);
    try {
      await api.post("/api/certificates", { userId: newUser, courseId: newCourse });
      toast.success("Certificate issued.");
      setIssueOpen(false);
      setNewUser("");
      setNewCourse("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't issue certificate.");
    } finally {
      setIssuing(false);
    }
  }

  async function setStatus(c: CertRow, status: "ISSUED" | "REVOKED") {
    try {
      await api.patch(`/api/certificates/${c.id}`, { status });
      toast.success(status === "REVOKED" ? "Revoked." : "Reinstated.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed.");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/certificates/${deleting.id}`);
      toast.success("Certificate deleted.");
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  const statCards = [
    { label: "Certificates", value: stats.total, icon: Award, tone: "text-rose-500" },
    { label: "Active", value: stats.active, icon: BadgeCheck, tone: "text-emerald-500" },
    { label: "Revoked", value: stats.revoked, icon: Ban, tone: "text-amber-500" },
    { label: "Recipients", value: stats.recipients, icon: Users, tone: "text-violet-500" },
  ];

  function statusBadge(c: CertRow) {
    return c.status === "REVOKED" ? (
      <Badge variant="secondary" className="bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
        Revoked
      </Badge>
    ) : (
      <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
        Issued
      </Badge>
    );
  }

  function rowActions(c: CertRow) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />} aria-label="Actions">
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDetail(c)}>
            <Eye className="size-4" /> View &amp; verify
          </DropdownMenuItem>
          {canManage &&
            (c.status === "REVOKED" ? (
              <DropdownMenuItem onClick={() => setStatus(c, "ISSUED")}>
                <RotateCcw className="size-4" /> Reinstate
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => setStatus(c, "REVOKED")}>
                <Ban className="size-4" /> Revoke
              </DropdownMenuItem>
            ))}
          {canManage && (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setDeleting(c)}
            >
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const columns: Column<CertRow>[] = [
    {
      key: "student",
      header: "Recipient",
      cell: (c) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-8 shrink-0">
            {c.studentAvatar && <AvatarImage src={c.studentAvatar} alt={c.studentName} />}
            <AvatarFallback className="text-xs">{initials(c.studentName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{c.studentName}</p>
            <p className="text-muted-foreground truncate text-xs">{c.courseTitle}</p>
          </div>
        </div>
      ),
    },
    {
      key: "serial",
      header: "Serial",
      cell: (c) => <span className="font-mono text-xs">{c.serialNumber}</span>,
    },
    { key: "status", header: "Status", cell: statusBadge },
    {
      key: "issued",
      header: "Issued",
      cell: (c) => (
        <span className="text-sm whitespace-nowrap">{format(new Date(c.issuedAt), "d MMM yyyy")}</span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "w-10",
      cell: (c) => rowActions(c),
    },
  ];

  function renderCard(c: CertRow) {
    return (
      <div className="rounded-xl border p-4">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={() => setDetail(c)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <Avatar className="size-9 shrink-0">
              {c.studentAvatar && <AvatarImage src={c.studentAvatar} alt={c.studentName} />}
              <AvatarFallback className="text-xs">{initials(c.studentName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">{c.studentName}</p>
              <p className="text-muted-foreground truncate text-xs">{c.courseTitle}</p>
            </div>
          </button>
          {rowActions(c)}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-muted-foreground font-mono text-xs">{c.serialNumber}</span>
          {statusBadge(c)}
        </div>
      </div>
    );
  }

  const canIssue = Boolean(newUser && newCourse);

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          canManage ? (
            <Button onClick={() => setIssueOpen(true)}>
              <Plus className="size-4" /> Issue certificate
            </Button>
          ) : undefined
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
        data={certificates}
        rowKey={(c) => c.id}
        renderCard={renderCard}
        emptyIcon={Award}
        emptyTitle={hasFilters ? "No matching certificates" : "No certificates yet"}
        emptyDescription={
          hasFilters ? "Try adjusting your search or filters." : "Issue your first certificate to get started."
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
                placeholder="Search name, serial or code…"
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
                    {(v) => (!v || v === ALL ? "All statuses" : CERTIFICATE_STATUS_LABEL[String(v)])}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {CERTIFICATE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {CERTIFICATE_STATUS_LABEL[s]}
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
              {total} {total === 1 ? "certificate" : "certificates"}
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

      {/* Issue dialog */}
      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Issue certificate</DialogTitle>
            <DialogDescription>Award a course-completion certificate to a learner.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onIssue} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Learner</Label>
              <Select value={newUser} onValueChange={(v) => setNewUser(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a learner">
                    {(v) => users.find((u) => u.id === v)?.name ?? "Choose a learner"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} · {u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Course</Label>
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
              <Button type="button" variant="outline" onClick={() => setIssueOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canIssue || issuing}>
                {issuing && <Loader2 className="size-4 animate-spin" />}
                Issue
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <CertificateDetailSheet cert={detail} onOpenChange={(o) => !o && setDetail(null)} canManage={canManage} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this certificate?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the certificate for {deleting?.studentName}. This can&apos;t be undone.
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
