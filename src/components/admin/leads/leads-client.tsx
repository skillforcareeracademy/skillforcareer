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
  MessageSquare,
  Paperclip,
  SlidersHorizontal,
  CopyCheck,
  FileBarChart,
  UserRound,
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
  LEAD_FILTER_KEYS,
  LEAD_SORTS,
  LEAD_SORT_LABELS,
  DEFAULT_LEAD_SORT,
  type LeadStage,
  type LeadClassMode,
  type LeadContactChannel,
  type LeadQuality,
  type LeadSort,
  type LeadStatCard,
  type LeadViewParams,
} from "@/lib/validations/lead";
import type { Role } from "@/config/roles";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  SOURCE_LABEL,
  CLASS_MODE_LABEL,
  inIST,
} from "@/components/admin/leads/lead-badges";
import { LeadContactActions } from "@/components/admin/leads/lead-contact-actions";
import { LeadDetailSheet } from "@/components/admin/leads/lead-detail-sheet";
import { LeadImportDialog } from "@/components/admin/leads/lead-import-dialog";
import { LeadDuplicatesDialog } from "@/components/admin/leads/lead-duplicates-dialog";
import { LeadStatCards } from "@/components/admin/leads/lead-stat-cards";
import {
  AssigneeEditor,
  ClassModeEditor,
  FeesEditor,
  FollowUpEditor,
  QualityEditor,
  StageEditor,
  VisitEditor,
  type SaveLead,
} from "@/components/admin/leads/lead-inline-edit";
import {
  AssigneeLabel,
  LeadFormFields,
  blankLeadForm,
  leadFormPayload,
  type AssigneeOption,
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
  assignedToId: string | null;
  assignedToName: string | null;
  followUps: number;
  documents: number;
  createdAt: string;
}
type Query = { page: number; pageSize: number } & LeadViewParams;

const ALL = "all";
const VIEW_KEYS = [...LEAD_FILTER_KEYS, "sort"] as const;
const inr = (n: number | null) =>
  n == null ? null : `₹${n.toLocaleString("en-IN")}`;

function errorMessage(err: unknown, fallback: string): string {
  const d =
    err instanceof ApiError
      ? (err.details as { issues?: { message: string }[] })
      : undefined;
  return (
    d?.issues?.[0]?.message ??
    (err instanceof ApiError ? err.message : fallback)
  );
}

export function LeadsClient({
  leads,
  total,
  query,
  stats,
  cards,
  viewer,
  assignees,
  courses,
}: {
  leads: LeadRow[];
  total: number;
  query: Query;
  stats: Record<LeadStatCard, number>;
  cards: LeadStatCard[];
  viewer: { id: string; name: string; role: Role };
  assignees: AssigneeOption[];
  courses: CourseOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  // Deleting and de-duplicating can't be undone, so they're admin-only (the
  // API refuses sales agents too); everything else is open to the sheet's workers.
  const isLeadAdmin = viewer.role === "SUPER_ADMIN" || viewer.role === "ADMIN";
  const [search, setSearch] = useState(query.search ?? "");
  const [minScore, setMinScore] = useState(query.minScore ?? "");
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
      query.to ||
      query.uploadedFrom ||
      query.uploadedTo,
    ),
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [form, setForm] = useState<LeadFormState>(blankLeadForm);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<LeadRow | null>(null);
  /** The open lead and where it sits in the filtered, sorted list (0-based). */
  const [detail, setDetail] = useState<{ id: string; index: number } | null>(
    null,
  );
  const [navBusy, setNavBusy] = useState(false);
  /** Other pages' ids, fetched as previous / next crosses into them. */
  const [idPages, setIdPages] = useState<{
    key: string;
    pages: Record<number, string[]>;
  }>({ key: "", pages: {} });
  /**
   * Inline edits shown before the server confirms. Tied to the `leads` array
   * they were made against: once `router.refresh()` hands back a new one, the
   * real values have landed and the overlay is dropped.
   */
  const [patches, setPatches] = useState<{
    base: LeadRow[];
    byId: Record<string, Partial<LeadRow>>;
  }>({ base: leads, byId: {} });

  const live = patches.base === leads ? patches.byId : {};
  const rows = leads.map((l) => (live[l.id] ? { ...l, ...live[l.id] } : l));

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const hasFilters = LEAD_FILTER_KEYS.some((k) => query[k]);
  const sort = (query.sort ?? DEFAULT_LEAD_SORT) as LeadSort;

  /** The list's filters and sort as a query string, with `overrides` applied. */
  const viewQuery = useCallback(
    (overrides: LeadViewParams = {}) => {
      const merged: LeadViewParams = { ...query, ...overrides };
      const p = new URLSearchParams();
      for (const key of VIEW_KEYS) {
        if (merged[key]) p.set(key, String(merged[key]));
      }
      return p.toString();
    },
    [query],
  );

  const setParams = useCallback(
    (
      next: LeadViewParams & { page?: number },
      opts: { scroll?: boolean } = {},
    ) => {
      const { page = query.page, ...view } = next;
      const p = new URLSearchParams(viewQuery(view));
      if (page > 1) p.set("page", String(page));
      const qs = p.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, opts);
    },
    [router, pathname, query.page, viewQuery],
  );

  /**
   * Both downloads carry the list's filters and sort, so what you see is what
   * you get. The search and score boxes are read as typed, so a download
   * clicked before they're applied still matches what's in them.
   */
  const downloadQuery = (() => {
    const qs = viewQuery({
      search: search.trim() || undefined,
      minScore: minScore.trim() || undefined,
    });
    return qs ? `?${qs}` : "";
  })();
  const exportHref = `/api/leads/export${downloadQuery}`;
  const reportHref = `/api/leads/report${downloadQuery}`;

  function applySearch() {
    const value = search.trim();
    if (value !== (query.search ?? "")) {
      setParams({ search: value || undefined, page: 1 });
    }
  }

  function applyMinScore() {
    const value = minScore.trim();
    if (value !== (query.minScore ?? "")) {
      setParams({ minScore: value || undefined, page: 1 });
    }
  }

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
      toast.error(errorMessage(err, "Couldn't add lead."));
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

  /** Inline table edits: show the change at once, undo it if the save fails. */
  const saveLead: SaveLead = async (lead, payload, optimistic) => {
    const before = live[lead.id];
    const put = (patch: Partial<LeadRow> | undefined) =>
      setPatches((p) => {
        const byId = { ...(p.base === leads ? p.byId : {}) };
        if (patch) byId[lead.id] = patch;
        else delete byId[lead.id];
        return { base: leads, byId };
      });

    put({ ...before, ...optimistic });
    try {
      await api.patch(`/api/leads/${lead.id}`, payload);
      router.refresh();
      return true;
    } catch (err) {
      put(before);
      toast.error(errorMessage(err, "Couldn't save that change."));
      return false;
    }
  };

  // ── Detail sheet: previous / next through the whole filtered list ────────

  const offset = (query.page - 1) * query.pageSize;
  const listKey = viewQuery();

  function openDetail(l: LeadRow) {
    const i = leads.findIndex((r) => r.id === l.id);
    setDetail({ id: l.id, index: offset + Math.max(0, i) });
  }

  async function goTo(index: number) {
    if (navBusy || index < 0 || index >= total) return;
    const page = Math.floor(index / query.pageSize) + 1;
    const cached = idPages.key === listKey ? idPages.pages : {};
    let ids = page === query.page ? leads.map((l) => l.id) : cached[page];

    if (!ids) {
      setNavBusy(true);
      try {
        const qs = new URLSearchParams(listKey);
        qs.set("page", String(page));
        qs.set("pageSize", String(query.pageSize));
        const res = await api.get<{ ids: string[]; total: number }>(
          `/api/leads/ids?${qs}`,
        );
        ids = res.ids;
        const fetched = res.ids;
        setIdPages((p) => ({
          key: listKey,
          pages: {
            ...(p.key === listKey ? p.pages : {}),
            [query.page]: leads.map((l) => l.id),
            [page]: fetched,
          },
        }));
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : "Couldn't open that lead.",
        );
        return;
      } finally {
        setNavBusy(false);
      }
    }

    const id = ids[index % query.pageSize];
    if (!id) return; // the list shrank since the count was taken
    setDetail({ id, index });
    // The table follows the sheet onto the page the lead sits on, so closing
    // it lands you where you were working.
    if (page !== query.page) setParams({ page }, { scroll: false });
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
          <DropdownMenuItem onClick={() => openDetail(l)}>
            <Eye className="size-4" /> View &amp; follow up
          </DropdownMenuItem>
          {isLeadAdmin && (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setDeleting(l)}
            >
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          )}
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
          onClick={() => openDetail(l)}
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
              {formatDistanceToNow(new Date(l.lastContact.at), {
                addSuffix: true,
              })}
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
      cell: (l) => <StageEditor lead={l} onSave={saveLead} />,
    },
    {
      key: "quality",
      header: "Quality",
      cell: (l) => <QualityEditor lead={l} onSave={saveLead} />,
    },
    {
      key: "mode",
      header: "Mode",
      cell: (l) => <ClassModeEditor lead={l} onSave={saveLead} />,
    },
    {
      key: "visit",
      header: "Visit",
      cell: (l) => <VisitEditor lead={l} onSave={saveLead} />,
    },
    {
      key: "followUp",
      header: "Follow-up",
      cell: (l) => <FollowUpEditor lead={l} onSave={saveLead} />,
    },
    {
      key: "fees",
      header: "Fees",
      cell: (l) => <FeesEditor lead={l} onSave={saveLead} />,
    },
    {
      key: "assigned",
      header: "Assigned",
      cell: (l) => (
        <AssigneeEditor
          lead={l}
          onSave={saveLead}
          assignees={assignees}
          viewerId={viewer.id}
        />
      ),
    },
    {
      key: "received",
      header: "Lead received",
      cell: (l) => (
        <span className="text-sm whitespace-nowrap">
          {format(inIST(l.leadDate), "d MMM yyyy")}
        </span>
      ),
    },
    {
      key: "uploaded",
      header: "Uploaded",
      cell: (l) => (
        <span className="text-muted-foreground text-sm whitespace-nowrap">
          {format(inIST(l.createdAt), "d MMM, h:mm a")}
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
            onClick={() => openDetail(l)}
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
            {formatDistanceToNow(new Date(l.lastContact.at), {
              addSuffix: true,
            })}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-1.5 text-xs">
          <StageEditor lead={l} onSave={saveLead} />
          <QualityEditor lead={l} onSave={saveLead} />
        </div>
        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span>{SOURCE_LABEL(l.source)}</span>
          {l.classMode && <span>{CLASS_MODE_LABEL(l.classMode)}</span>}
          {inr(l.finalFees ?? l.feesOffered) && (
            <span>{inr(l.finalFees ?? l.feesOffered)}</span>
          )}
          {l.assignedToName && <span>{l.assignedToName}</span>}
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
        <div className="mt-1 pl-1.5">
          <FollowUpEditor lead={l} onSave={saveLead} prefix="Follow-up: " />
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Received {format(inIST(l.leadDate), "d MMM yyyy")} · Uploaded{" "}
          {format(inIST(l.createdAt), "d MMM, h:mm a")}
        </p>
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

  const mine = query.assignedToId === "me";

  function assignedFilterLabel(v: string | null): string {
    if (!v || v === ALL) return "Anyone";
    if (v === "me") return "Assigned to me";
    if (v === "unassigned") return "Unassigned";
    return assignees.find((a) => a.id === v)?.name ?? "Anyone";
  }

  function dateFilter(
    id: string,
    label: string,
    key: "from" | "to" | "uploadedFrom" | "uploadedTo",
  ) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs" htmlFor={id}>
          {label}
        </Label>
        <Input
          id={id}
          type="date"
          value={query[key] ?? ""}
          onChange={(e) =>
            setParams({ [key]: e.target.value || undefined, page: 1 })
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Enquiries from the website, walk-ins and imported sheets — track and follow up."
        actions={
          <div className="flex flex-wrap gap-2">
            {isLeadAdmin && (
              <Button variant="outline" onClick={() => setDuplicatesOpen(true)}>
                <CopyCheck className="size-4" /> Duplicates
              </Button>
            )}
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" /> Import
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<a href={reportHref} />}
              title={
                hasFilters
                  ? "Summary of the leads matching your filters"
                  : "Summary of every lead"
              }
            >
              <FileBarChart className="size-4" /> Report
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<a href={exportHref} />}
              title={
                hasFilters
                  ? "The leads matching your filters, as a sheet"
                  : "Every lead, as a sheet"
              }
            >
              <Download className="size-4" /> Export
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Add lead
            </Button>
          </div>
        }
      />

      <LeadStatCards stats={stats} cards={cards} />

      <DataTable
        data={rows}
        columns={columns}
        rowKey={(l) => l.id}
        renderCard={renderCard}
        emptyIcon={Target}
        emptyTitle={hasFilters ? "No leads match" : "No leads yet"}
        emptyDescription={
          hasFilters
            ? "Try clearing a filter or two."
            : "Website enquiries, walk-ins and imported sheets will show up here."
        }
        toolbar={
          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  applySearch();
                }}
                className="relative flex-1 sm:min-w-56"
              >
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onBlur={applySearch}
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
              <Select
                value={sort}
                onValueChange={(v) =>
                  setParams({
                    sort: !v || v === DEFAULT_LEAD_SORT ? undefined : String(v),
                    page: 1,
                  })
                }
              >
                <SelectTrigger className="w-full sm:w-48" aria-label="Sort">
                  <SelectValue>
                    {(v) =>
                      LEAD_SORT_LABELS[(v as LeadSort) ?? DEFAULT_LEAD_SORT]
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LEAD_SORTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {LEAD_SORT_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant={mine ? "secondary" : "ghost"}
                aria-pressed={mine}
                onClick={() =>
                  setParams({ assignedToId: mine ? undefined : "me", page: 1 })
                }
              >
                <UserRound className="size-4" /> My leads
              </Button>
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
                    setMinScore("");
                    setParams({
                      ...Object.fromEntries(
                        LEAD_FILTER_KEYS.map((k) => [k, undefined]),
                      ),
                      page: 1,
                    });
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
                      <SelectValue>{(v) => assignedFilterLabel(v)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Anyone</SelectItem>
                      <SelectItem value="me">Assigned to me</SelectItem>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {assignees.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          <AssigneeLabel person={a} />
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
                    value={minScore}
                    onChange={(e) => setMinScore(e.target.value)}
                    onBlur={applyMinScore}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyMinScore();
                    }}
                  />
                </div>
                {dateFilter("f-from", "Lead received from", "from")}
                {dateFilter("f-to", "Lead received to", "to")}
                {dateFilter("f-up-from", "Lead uploaded from", "uploadedFrom")}
                {dateFilter("f-up-to", "Lead uploaded to", "uploadedTo")}
              </div>
            )}
          </div>
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground text-sm">
              {hasFilters
                ? `${total} matching lead${total === 1 ? "" : "s"} — Report and Export download just these`
                : `${total} leads`}
            </span>
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
        leadId={detail?.id ?? null}
        assignees={assignees}
        courses={courses}
        nav={
          detail
            ? {
                position: detail.index + 1,
                total,
                busy: navBusy,
                onPrev:
                  detail.index > 0
                    ? () => void goTo(detail.index - 1)
                    : undefined,
                onNext:
                  detail.index + 1 < total
                    ? () => void goTo(detail.index + 1)
                    : undefined,
              }
            : undefined
        }
        onOpenChange={(o) => !o && setDetail(null)}
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
