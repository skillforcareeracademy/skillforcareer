"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import {
  Plus,
  Search,
  Download,
  Upload,
  Target,
  MoreHorizontal,
  Eye,
  Trash2,
  Loader2,
  Phone as PhoneIcon,
  Sparkles,
  UserCheck,
  TrendingUp,
  XCircle,
  MessageSquare,
  Paperclip,
  SlidersHorizontal,
  CopyCheck,
  FileBarChart,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  LEAD_CLASS_MODES,
  LEAD_CLASS_MODE_LABELS,
  LEAD_QUALITIES,
  LEAD_QUALITY_LABELS,
  LEAD_SUB_STATUSES,
  LEAD_CONTACT_CHANNEL_LABELS,
  type LeadStage,
  type LeadClassMode,
  type LeadContactChannel,
  type LeadQuality,
} from "@/lib/validations/lead";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  STAGE_BADGE,
  SUB_STATUS_BADGE,
  QUALITY_BADGE,
  SOURCE_LABEL,
  CLASS_MODE_LABEL,
} from "@/components/admin/leads/lead-badges";
import { LeadContactActions } from "@/components/admin/leads/lead-contact-actions";
import { LeadDetailSheet } from "@/components/admin/leads/lead-detail-sheet";
import { LeadImportDialog } from "@/components/admin/leads/lead-import-dialog";
import { LeadDuplicatesDialog } from "@/components/admin/leads/lead-duplicates-dialog";
import {
  LeadFormFields,
  blankLeadForm,
  leadFormPayload,
  type CourseOption,
  type LeadFormState,
} from "@/components/admin/leads/lead-form";

interface LeadRow {
  id: string;
  leadNo: string | null;
  leadDate: string;
  name: string;
  email: string | null;
  phone: string;
  whatsapp: string | null;
  lastContact: { channel: string; at: string; by: string } | null;
  course: string | null;
  source: string;
  stage: string;
  subStatus: string | null;
  quality: string | null;
  leadScore: number | null;
  classMode: string | null;
  expectedVisit: string | null;
  visitDate: string | null;
  visitTime: string | null;
  followUpDate: string | null;
  followUpTime: string | null;
  feesOffered: number | null;
  finalFees: number | null;
  assignedToName: string | null;
  followUps: number;
  documents: number;
  createdAt: string;
}
interface Stats {
  total: number;
  fresh: number;
  inProgress: number;
  converted: number;
  dropped: number;
}
interface Query {
  page: number;
  pageSize: number;
  search?: string;
  stage?: string;
  subStatus?: string;
  source?: string;
  classMode?: string;
  courseId?: string;
  assignedToId?: string;
  quality?: string;
  minScore?: string;
  due?: string;
  from?: string;
  to?: string;
}

const ALL = "all";
const inr = (n: number | null) =>
  n == null ? null : `₹${n.toLocaleString("en-IN")}`;

export function LeadsClient({
  leads,
  total,
  query,
  stats,
  assignees,
  courses,
}: {
  leads: LeadRow[];
  total: number;
  query: Query;
  stats: Stats;
  assignees: { id: string; name: string }[];
  courses: CourseOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(query.search ?? "");
  const [showFilters, setShowFilters] = useState(
    Boolean(
      query.classMode ||
      query.courseId ||
      query.assignedToId ||
      query.subStatus ||
      query.quality ||
      query.minScore ||
      query.due ||
      query.from ||
      query.to,
    ),
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [form, setForm] = useState<LeadFormState>(blankLeadForm);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<LeadRow | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const hasFilters = Boolean(
    query.search ||
    query.stage ||
    query.subStatus ||
    query.source ||
    query.classMode ||
    query.courseId ||
    query.assignedToId ||
    query.quality ||
    query.minScore ||
    query.due ||
    query.from ||
    query.to,
  );

  const FILTER_KEYS = [
    "search",
    "stage",
    "subStatus",
    "source",
    "classMode",
    "courseId",
    "assignedToId",
    "quality",
    "minScore",
    "due",
    "from",
    "to",
  ] as const;

  const setParams = useCallback(
    (next: Record<string, string | number | undefined>) => {
      const merged: Record<string, string | number | undefined> = {
        ...Object.fromEntries(FILTER_KEYS.map((k) => [k, query[k]])),
        page: query.page,
        ...next,
      };
      const p = new URLSearchParams();
      for (const key of FILTER_KEYS) {
        if (merged[key]) p.set(key, String(merged[key]));
      }
      if (merged.page && Number(merged.page) > 1)
        p.set("page", String(merged.page));
      const qs = p.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, pathname, query],
  );

  /** Both downloads carry the list's current filters, so what you see is what
   *  you get — the client asked for reports "as per filters and statuses". */
  const filterQuery = (() => {
    const p = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      if (query[key]) p.set(key, String(query[key]));
    }
    const qs = p.toString();
    return qs ? `?${qs}` : "";
  })();
  const exportHref = `/api/leads/export${filterQuery}`;
  const reportHref = `/api/leads/report${filterQuery}`;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post("/api/leads", leadFormPayload(form));
      toast.success("Lead added.");
      setCreateOpen(false);
      setForm(blankLeadForm());
      router.refresh();
    } catch (err) {
      const d =
        err instanceof ApiError
          ? (err.details as { issues?: { message: string }[] })
          : undefined;
      toast.error(
        d?.issues?.[0]?.message ??
          (err instanceof ApiError ? err.message : "Couldn't add lead."),
      );
    } finally {
      setCreating(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/leads/${deleting.id}`);
      toast.success("Lead deleted.");
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  const statCards = [
    {
      label: "Total leads",
      value: stats.total,
      icon: Target,
      tone: "text-rose-500",
    },
    {
      label: "Fresh",
      value: stats.fresh,
      icon: Sparkles,
      tone: "text-sky-500",
    },
    {
      label: "In progress",
      value: stats.inProgress,
      icon: UserCheck,
      tone: "text-amber-500",
    },
    {
      label: "Converted",
      value: stats.converted,
      icon: TrendingUp,
      tone: "text-emerald-500",
    },
    {
      label: "Not interested",
      value: stats.dropped,
      icon: XCircle,
      tone: "text-muted-foreground",
    },
  ];

  /** A call-back whose day has already passed reads as overdue. */
  function isOverdue(iso: string): boolean {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return new Date(iso) < start;
  }

  /** "29 Aug, 16:30" / "This Saturday" / "—" — whatever the counsellor captured. */
  function visitLabel(l: LeadRow): string {
    if (l.visitDate) {
      return `${format(new Date(l.visitDate), "d MMM")}${l.visitTime ? `, ${l.visitTime}` : ""}`;
    }
    return l.expectedVisit ?? "—";
  }

  function rowActions(l: LeadRow) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" />}
          aria-label="Actions"
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDetailId(l.id)}>
            <Eye className="size-4" /> View &amp; follow up
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleting(l)}
          >
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const dash = <span className="text-muted-foreground">—</span>;

  const columns: Column<LeadRow>[] = [
    {
      key: "leadNo",
      header: "Lead no.",
      headerClassName: "w-24",
      cell: (l) => (
        <span className="font-mono text-xs whitespace-nowrap">
          {l.leadNo ?? "—"}
        </span>
      ),
    },
    {
      key: "name",
      header: "Lead",
      cell: (l) => (
        <button
          type="button"
          onClick={() => setDetailId(l.id)}
          className="min-w-0 text-left"
        >
          <p className="hover:text-primary truncate font-medium transition-colors">
            {l.name}
          </p>
          <p className="text-muted-foreground flex items-center gap-1 truncate text-xs">
            <PhoneIcon className="size-3" /> {l.phone}
          </p>
        </button>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      headerClassName: "w-28",
      cell: (l) => (
        <div className="space-y-0.5">
          <LeadContactActions lead={l} onLogged={() => router.refresh()} />
          {l.lastContact && (
            <p className="text-muted-foreground pl-1.5 text-[11px] whitespace-nowrap">
              {LEAD_CONTACT_CHANNEL_LABELS[
                l.lastContact.channel as LeadContactChannel
              ] ?? l.lastContact.channel}{" "}
              {formatDistanceToNow(new Date(l.lastContact.at), { addSuffix: true })}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "course",
      header: "Course",
      cell: (l) => <span className="text-sm">{l.course ?? dash}</span>,
    },
    {
      key: "stage",
      header: "Stage / status",
      cell: (l) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {STAGE_BADGE(l.stage)}
          {SUB_STATUS_BADGE(l.subStatus)}
        </div>
      ),
    },
    {
      key: "quality",
      header: "Quality",
      cell: (l) => (
        <div className="flex items-center gap-1.5">
          {QUALITY_BADGE(l.quality) ?? dash}
          {l.leadScore != null && (
            <span className="text-muted-foreground text-xs tabular-nums">
              {l.leadScore}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "mode",
      header: "Mode",
      cell: (l) => (
        <span className="text-sm">{CLASS_MODE_LABEL(l.classMode)}</span>
      ),
    },
    {
      key: "visit",
      header: "Visit",
      cell: (l) => (
        <span className="text-sm whitespace-nowrap">{visitLabel(l)}</span>
      ),
    },
    {
      key: "followUp",
      header: "Follow-up",
      cell: (l) => {
        if (!l.followUpDate) return dash;
        const overdue = isOverdue(l.followUpDate);
        return (
          <span
            className={`text-sm whitespace-nowrap ${overdue ? "text-destructive font-medium" : ""}`}
          >
            {format(new Date(l.followUpDate), "d MMM")}
            {l.followUpTime ? `, ${l.followUpTime}` : ""}
          </span>
        );
      },
    },
    {
      key: "fees",
      header: "Fees",
      cell: (l) => (
        <span className="text-sm whitespace-nowrap tabular-nums">
          {inr(l.finalFees ?? l.feesOffered) ?? dash}
        </span>
      ),
    },
    {
      key: "assigned",
      header: "Assigned",
      cell: (l) => <span className="text-sm">{l.assignedToName ?? dash}</span>,
    },
    {
      key: "created",
      header: "Received",
      cell: (l) => (
        <span className="text-muted-foreground text-sm whitespace-nowrap">
          {formatDistanceToNow(new Date(l.leadDate), { addSuffix: true })}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "w-10",
      cell: rowActions,
    },
  ];

  function renderCard(l: LeadRow) {
    return (
      <div className="rounded-xl border p-4">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => setDetailId(l.id)}
            className="min-w-0 text-left"
          >
            <p className="truncate font-medium">
              {l.name}
              {l.leadNo && (
                <span className="text-muted-foreground ml-1.5 font-mono text-xs">
                  {l.leadNo}
                </span>
              )}
            </p>
            <p className="text-muted-foreground flex items-center gap-1 truncate text-xs">
              <PhoneIcon className="size-3" /> {l.phone}
            </p>
          </button>
          <div className="flex shrink-0 items-center">
            {/* On a phone these are the whole point of the screen — a
                counsellor works the queue by tapping call, not by opening
                sheets — so they sit in the card header, not behind a menu. */}
            <LeadContactActions lead={l} onLogged={() => router.refresh()} />
            {rowActions(l)}
          </div>
        </div>
        {l.lastContact && (
          <p className="text-muted-foreground mt-1.5 text-xs">
            {LEAD_CONTACT_CHANNEL_LABELS[
              l.lastContact.channel as LeadContactChannel
            ] ?? l.lastContact.channel}{" "}
            by {l.lastContact.by}{" "}
            {formatDistanceToNow(new Date(l.lastContact.at), { addSuffix: true })}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          {STAGE_BADGE(l.stage)}
          {SUB_STATUS_BADGE(l.subStatus)}
          {QUALITY_BADGE(l.quality)}
        </div>
        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span>{SOURCE_LABEL(l.source)}</span>
          {l.classMode && <span>{CLASS_MODE_LABEL(l.classMode)}</span>}
          {inr(l.finalFees ?? l.feesOffered) && (
            <span>{inr(l.finalFees ?? l.feesOffered)}</span>
          )}
          {l.followUps > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare className="size-3" /> {l.followUps}
            </span>
          )}
          {l.documents > 0 && (
            <span className="flex items-center gap-1">
              <Paperclip className="size-3" /> {l.documents}
            </span>
          )}
        </div>
        {l.course && (
          <p className="text-muted-foreground mt-1.5 text-xs">
            Course: {l.course}
          </p>
        )}
        {l.followUpDate && (
          <p
            className={`mt-1 text-xs ${isOverdue(l.followUpDate) ? "text-destructive font-medium" : "text-muted-foreground"}`}
          >
            Follow-up: {format(new Date(l.followUpDate), "d MMM")}
            {l.followUpTime ? `, ${l.followUpTime}` : ""}
          </p>
        )}
      </div>
    );
  }

  const subStatusOptions = query.stage
    ? (LEAD_SUB_STATUSES[query.stage as LeadStage] ?? [])
    : Array.from(new Set(Object.values(LEAD_SUB_STATUSES).flat()));

  const canAdd =
    form.name.trim().length >= 2 &&
    form.phone.trim().length >= 6 &&
    form.expectedVisit.trim().length > 0 &&
    form.feesOffered.trim().length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Enquiries from the website, walk-ins and imported sheets — track and follow up."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setDuplicatesOpen(true)}>
              <CopyCheck className="size-4" /> Duplicates
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" /> Import
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<a href={reportHref} />}
            >
              <FileBarChart className="size-4" /> Report
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<a href={exportHref} />}
            >
              <Download className="size-4" /> Export
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Add lead
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="bg-muted grid size-10 shrink-0 place-items-center rounded-lg">
                <s.icon className={`size-5 ${s.tone}`} />
              </div>
              <div className="min-w-0">
                <p className="text-2xl leading-none font-semibold tabular-nums">
                  {s.value}
                </p>
                <p className="text-muted-foreground mt-1 truncate text-xs">
                  {s.label}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataTable
        data={leads}
        columns={columns}
        rowKey={(l) => l.id}
        renderCard={renderCard}
        emptyIcon={Target}
        emptyTitle="No leads yet"
        emptyDescription="Website enquiries, walk-ins and imported sheets will show up here."
        toolbar={
          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setParams({ search: search || undefined, page: 1 });
                }}
                className="relative flex-1"
              >
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search lead no., name, phone, email…"
                  className="pl-9"
                />
              </form>
              <Select
                value={query.stage ?? ALL}
                onValueChange={(v) =>
                  setParams({
                    stage: !v || v === ALL ? undefined : v,
                    subStatus: undefined,
                    page: 1,
                  })
                }
              >
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue>
                    {(v) =>
                      !v || v === ALL
                        ? "All stages"
                        : LEAD_STAGE_LABELS[v as LeadStage]
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All stages</SelectItem>
                  {LEAD_STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {LEAD_STAGE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={query.source ?? ALL}
                onValueChange={(v) =>
                  setParams({
                    source: !v || v === ALL ? undefined : v,
                    page: 1,
                  })
                }
              >
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue>
                    {(v) =>
                      !v || v === ALL
                        ? "All sources"
                        : LEAD_SOURCE_LABELS[
                            v as keyof typeof LEAD_SOURCE_LABELS
                          ]
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All sources</SelectItem>
                  {LEAD_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {LEAD_SOURCE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant={showFilters ? "secondary" : "ghost"}
                onClick={() => setShowFilters((v) => !v)}
              >
                <SlidersHorizontal className="size-4" /> More
              </Button>
              {hasFilters && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSearch("");
                    setParams(
                      Object.fromEntries([
                        ...FILTER_KEYS.map((k) => [k, undefined]),
                        ["page", 1],
                      ]),
                    );
                  }}
                >
                  Clear
                </Button>
              )}
            </div>

            {showFilters && (
              <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select
                    value={query.subStatus ?? ALL}
                    onValueChange={(v) =>
                      setParams({
                        subStatus: !v || v === ALL ? undefined : v,
                        page: 1,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v) => (!v || v === ALL ? "Any status" : String(v))}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Any status</SelectItem>
                      {subStatusOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Course</Label>
                  <Select
                    value={query.courseId ?? ALL}
                    onValueChange={(v) =>
                      setParams({
                        courseId: !v || v === ALL ? undefined : v,
                        page: 1,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v) =>
                          !v || v === ALL
                            ? "All courses"
                            : (courses.find((c) => c.id === v)?.title ??
                              "All courses")
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
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Class mode</Label>
                  <Select
                    value={query.classMode ?? ALL}
                    onValueChange={(v) =>
                      setParams({
                        classMode: !v || v === ALL ? undefined : v,
                        page: 1,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v) =>
                          !v || v === ALL
                            ? "Any mode"
                            : LEAD_CLASS_MODE_LABELS[v as LeadClassMode]
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Any mode</SelectItem>
                      {LEAD_CLASS_MODES.map((m) => (
                        <SelectItem key={m} value={m}>
                          {LEAD_CLASS_MODE_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Assigned to</Label>
                  <Select
                    value={query.assignedToId ?? ALL}
                    onValueChange={(v) =>
                      setParams({
                        assignedToId: !v || v === ALL ? undefined : v,
                        page: 1,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v) =>
                          !v || v === ALL
                            ? "Anyone"
                            : v === "unassigned"
                              ? "Unassigned"
                              : (assignees.find((a) => a.id === v)?.name ??
                                "Anyone")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Anyone</SelectItem>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {assignees.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Follow-up due</Label>
                  <Select
                    value={query.due ?? ALL}
                    onValueChange={(v) =>
                      setParams({
                        due: !v || v === ALL ? undefined : v,
                        page: 1,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v) =>
                          !v || v === ALL
                            ? "Any time"
                            : v === "overdue"
                              ? "Overdue"
                              : v === "today"
                                ? "Due today"
                                : "Next 7 days"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Any time</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                      <SelectItem value="today">Due today</SelectItem>
                      <SelectItem value="week">Next 7 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Lead quality</Label>
                  <Select
                    value={query.quality ?? ALL}
                    onValueChange={(v) =>
                      setParams({
                        quality: !v || v === ALL ? undefined : v,
                        page: 1,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v) =>
                          !v || v === ALL
                            ? "Any quality"
                            : LEAD_QUALITY_LABELS[v as LeadQuality]
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Any quality</SelectItem>
                      {LEAD_QUALITIES.map((q) => (
                        <SelectItem key={q} value={q}>
                          {LEAD_QUALITY_LABELS[q]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="f-score">
                    Minimum lead score
                  </Label>
                  <Input
                    id="f-score"
                    inputMode="numeric"
                    placeholder="e.g. 60"
                    defaultValue={query.minScore ?? ""}
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (value !== (query.minScore ?? "")) {
                        setParams({ minScore: value || undefined, page: 1 });
                      }
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="f-from">
                    Lead date from
                  </Label>
                  <Input
                    id="f-from"
                    type="date"
                    value={query.from ?? ""}
                    onChange={(e) =>
                      setParams({ from: e.target.value || undefined, page: 1 })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="f-to">
                    Lead date to
                  </Label>
                  <Input
                    id="f-to"
                    type="date"
                    value={query.to ?? ""}
                    onChange={(e) =>
                      setParams({ to: e.target.value || undefined, page: 1 })
                    }
                  />
                </div>
              </div>
            )}
          </div>
        }
        footer={
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">{total} leads</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={query.page <= 1}
                onClick={() => setParams({ page: query.page - 1 })}
              >
                Previous
              </Button>
              <span className="text-muted-foreground text-sm">
                Page {query.page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={query.page >= totalPages}
                onClick={() => setParams({ page: query.page + 1 })}
              >
                Next
              </Button>
            </div>
          </div>
        }
      />

      {/* Add lead */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add a lead</DialogTitle>
            <DialogDescription>
              A lead number (SFC…) is assigned automatically when you save.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-4">
            <LeadFormFields
              form={form}
              onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
              courses={courses}
              assignees={assignees}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating || !canAdd}>
                {creating && <Loader2 className="size-4 animate-spin" />}
                Add lead
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <LeadImportDialog open={importOpen} onOpenChange={setImportOpen} />

      <LeadDuplicatesDialog
        open={duplicatesOpen}
        onOpenChange={setDuplicatesOpen}
      />

      <LeadDetailSheet
        leadId={detailId}
        assignees={assignees}
        courses={courses}
        onOpenChange={(o) => !o && setDetailId(null)}
      />

      <AlertDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.name}&apos;s enquiry, follow-ups and documents will be
              permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
