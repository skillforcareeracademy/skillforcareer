"use client";

import { useCallback, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Download,
  Eye,
  FileText,
  MapPin,
  MoreHorizontal,
  Phone as PhoneIcon,
  Search,
  SlidersHorizontal,
  Trash2,
  UserSearch,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import {
  CANDIDATE_STATUSES,
  CANDIDATE_STATUS_COLORS,
  CANDIDATE_STATUS_LABELS,
  EXPERIENCE_LEVELS,
  EXPERIENCE_LEVEL_LABELS,
  JOB_MODES,
  JOB_MODE_LABELS,
  type ExperienceLevel,
  type JobMode,
} from "@/lib/validations/careers";
import type {
  CandidateListQuery,
  CandidateRow,
  CourseOption,
  HiringPartnerRow,
  PartnerRow,
  StatusCounts,
} from "@/server/services/careers-service";
import { DataTable, type Column } from "@/components/shared/data-table";
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
import { cn } from "@/lib/utils";
import { LevelBadge, StatusBadge } from "@/components/admin/careers/career-badges";
import { CandidateSheet } from "@/components/admin/careers/candidate-sheet";
import { apiErrorMessage } from "@/components/admin/careers/partner-dialog";

const ALL = "all";

const CANDIDATE_FILTER_KEYS = [
  "search",
  "status",
  "level",
  "courseId",
  "mode",
  "location",
  "placementPartnerId",
  "hiringPartnerId",
] as const;

type FilterKey = (typeof CANDIDATE_FILTER_KEYS)[number];

/**
 * Every CV received, filterable the ways the placement team asked for — status,
 * fresher/experienced, course, where and how they want to work, and which
 * partner has them — with the filtered list one click from a spreadsheet.
 */
export function CandidatesPanel({
  rows,
  total,
  query,
  counts,
  courses,
  placementPartners,
  hiringPartners,
  openCandidateId,
}: {
  rows: CandidateRow[];
  total: number;
  query: CandidateListQuery;
  counts: StatusCounts;
  courses: CourseOption[];
  placementPartners: PartnerRow[];
  hiringPartners: HiringPartnerRow[];
  openCandidateId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(query.search ?? "");
  const [showFilters, setShowFilters] = useState(
    Boolean(
      query.courseId ||
        query.mode ||
        query.location ||
        query.placementPartnerId ||
        query.hiringPartnerId,
    ),
  );
  const [detailId, setDetailId] = useState<string | null>(openCandidateId ?? null);
  const [deleting, setDeleting] = useState<CandidateRow | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const hasFilters = CANDIDATE_FILTER_KEYS.some((k) => query[k]);

  const setParams = useCallback(
    (next: Partial<Record<FilterKey | "page", string | number | undefined>>) => {
      const merged: Record<string, string | number | undefined> = {
        ...Object.fromEntries(CANDIDATE_FILTER_KEYS.map((k) => [k, query[k]])),
        page: query.page,
        ...next,
      };
      const p = new URLSearchParams();
      for (const key of CANDIDATE_FILTER_KEYS) {
        if (merged[key]) p.set(key, String(merged[key]));
      }
      if (merged.page && Number(merged.page) > 1) p.set("page", String(merged.page));
      const qs = p.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, query],
  );

  /** The export carries the list's filters — what you see is what you get. */
  const exportHref = (() => {
    const p = new URLSearchParams();
    for (const key of CANDIDATE_FILTER_KEYS) {
      if (query[key]) p.set(key, String(query[key]));
    }
    const qs = p.toString();
    return `/api/admin/careers/candidates/export${qs ? `?${qs}` : ""}`;
  })();

  const placementName = new Map(placementPartners.map((p) => [p.id, p.name]));
  const hiringName = new Map(hiringPartners.map((p) => [p.id, p.name]));
  const postTitle = new Map(hiringPartners.flatMap((p) => p.posts.map((post) => [post.id, post.title])));

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/admin/careers/candidates/${deleting.id}`);
      toast.success("Candidate deleted.");
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Delete failed."));
    }
  }

  const dash = <span className="text-muted-foreground">—</span>;

  function rowActions(c: CandidateRow) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />} aria-label="Actions">
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDetailId(c.id)}>
            <Eye className="size-4" /> View &amp; update
          </DropdownMenuItem>
          {c.cvUrl && (
            <DropdownMenuItem
              onClick={() => window.open(c.cvUrl!, "_blank", "noopener,noreferrer")}
            >
              <FileText className="size-4" /> Open CV
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleting(c)}
          >
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function partnersCell(c: CandidateRow) {
    const placement = c.placementPartnerId ? placementName.get(c.placementPartnerId) : null;
    const hiring = c.hiringPartnerId ? hiringName.get(c.hiringPartnerId) : null;
    const post = c.hiringPostId ? postTitle.get(c.hiringPostId) : null;
    if (!placement && !hiring) return dash;
    return (
      <div className="space-y-0.5 text-sm">
        {placement && (
          <p className="truncate">
            <span className="text-muted-foreground text-xs">Via </span>
            {placement}
          </p>
        )}
        {hiring && (
          <p className="truncate">
            <span className="text-muted-foreground text-xs">At </span>
            {hiring}
            {post && <span className="text-muted-foreground text-xs"> · {post}</span>}
          </p>
        )}
      </div>
    );
  }

  const columns: Column<CandidateRow>[] = [
    {
      key: "name",
      header: "Candidate",
      cell: (c) => (
        <button type="button" onClick={() => setDetailId(c.id)} className="min-w-0 text-left">
          <p className="hover:text-primary truncate font-medium transition-colors">{c.name}</p>
          <p className="text-muted-foreground flex items-center gap-1 truncate text-xs">
            <PhoneIcon className="size-3" /> {c.phone}
          </p>
        </button>
      ),
    },
    {
      key: "course",
      header: "Course / batch",
      cell: (c) => (
        <div className="max-w-52 text-sm">
          <p className="truncate">{c.courseName ?? dash}</p>
          {c.batchCode && (
            <p className="text-muted-foreground truncate font-mono text-xs">{c.batchCode}</p>
          )}
        </div>
      ),
    },
    {
      key: "job",
      header: "Wants",
      cell: (c) => (
        <div className="max-w-52 space-y-1">
          <p className="truncate text-sm">{c.jobExpecting ?? dash}</p>
          <LevelBadge level={c.experienceLevel} />
        </div>
      ),
    },
    {
      key: "where",
      header: "Location / mode",
      cell: (c) => (
        <div className="max-w-44 text-sm">
          <p className="truncate">{c.expectedLocation ?? dash}</p>
          {c.expectedMode && (
            <p className="text-muted-foreground text-xs">{JOB_MODE_LABELS[c.expectedMode]}</p>
          )}
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
    { key: "partners", header: "Partners", cell: partnersCell },
    {
      key: "received",
      header: "Received",
      cell: (c) => (
        <span className="text-muted-foreground text-sm whitespace-nowrap">
          {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
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

  function renderCard(c: CandidateRow) {
    return (
      <div className="rounded-xl border p-4">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={() => setDetailId(c.id)} className="min-w-0 text-left">
            <p className="truncate font-medium">{c.name}</p>
            <p className="text-muted-foreground flex items-center gap-1 truncate text-xs">
              <PhoneIcon className="size-3" /> {c.phone}
            </p>
          </button>
          {rowActions(c)}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={c.status} />
          <LevelBadge level={c.experienceLevel} />
        </div>
        {c.jobExpecting && <p className="mt-2 text-sm">{c.jobExpecting}</p>}
        <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {c.courseName && <span>{c.courseName}</span>}
          {c.batchCode && <span className="font-mono">{c.batchCode}</span>}
          {c.expectedLocation && (
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="size-3" /> {c.expectedLocation}
            </span>
          )}
          {c.expectedMode && <span>{JOB_MODE_LABELS[c.expectedMode]}</span>}
          <span>{formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}</span>
        </div>
      </div>
    );
  }

  const statusCards: { key: string | undefined; label: string; value: number; hex?: string }[] = [
    { key: undefined, label: "All candidates", value: counts.total },
    ...CANDIDATE_STATUSES.map((s) => ({
      key: s,
      label: CANDIDATE_STATUS_LABELS[s],
      value: counts[s],
      hex: CANDIDATE_STATUS_COLORS[s],
    })),
  ];

  const selectFilter = (
    key: FilterKey,
    label: string,
    allLabel: string,
    options: { value: string; label: string }[],
  ) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select
        value={query[key] ?? ALL}
        onValueChange={(v) => setParams({ [key]: !v || v === ALL ? undefined : String(v), page: 1 })}
      >
        <SelectTrigger className="w-full">
          <SelectValue>
            {(v) =>
              !v || v === ALL ? allLabel : (options.find((o) => o.value === v)?.label ?? allLabel)
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Counts by status — each one is also the quickest way to filter by it. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {statusCards.map((s) => {
          const active = (query.status ?? undefined) === s.key;
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => setParams({ status: s.key, page: 1 })}
              aria-pressed={active}
              className={cn(
                "bg-card rounded-xl border px-3 py-2.5 text-left transition-colors",
                active ? "border-primary ring-primary/25 ring-2" : "hover:bg-muted/60",
              )}
            >
              <p className="text-xl leading-none font-semibold tabular-nums">{s.value}</p>
              <p className="text-muted-foreground mt-1 flex items-center gap-1.5 truncate text-xs">
                {s.hex && (
                  <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: s.hex }} />
                )}
                {s.label}
              </p>
            </button>
          );
        })}
      </div>

      <DataTable
        data={rows}
        columns={columns}
        rowKey={(c) => c.id}
        renderCard={renderCard}
        emptyIcon={UserSearch}
        emptyTitle={hasFilters ? "No candidates match these filters" : "No CVs yet"}
        emptyDescription={
          hasFilters
            ? "Try clearing a filter or two."
            : "CVs sent from the careers page's “Send your CV” form land here."
        }
        toolbar={
          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setParams({ search: search.trim() || undefined, page: 1 });
                }}
                className="relative flex-1"
              >
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, phone, email, role, batch, company…"
                  className="pl-9"
                />
              </form>
              <Select
                value={query.level ?? ALL}
                onValueChange={(v) => setParams({ level: !v || v === ALL ? undefined : String(v), page: 1 })}
              >
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue>
                    {(v) =>
                      !v || v === ALL
                        ? "Fresher & experienced"
                        : EXPERIENCE_LEVEL_LABELS[v as ExperienceLevel]
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Fresher &amp; experienced</SelectItem>
                  {EXPERIENCE_LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {EXPERIENCE_LEVEL_LABELS[l]}
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
              <Button variant="outline" nativeButton={false} render={<a href={exportHref} />}>
                <Download className="size-4" /> Export
              </Button>
              {hasFilters && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSearch("");
                    setParams({
                      ...Object.fromEntries(CANDIDATE_FILTER_KEYS.map((k) => [k, undefined])),
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
                {selectFilter("courseId", "Course", "All courses", [
                  ...courses.map((c) => ({ value: c.id, label: c.title })),
                  { value: "other", label: "Other / not listed" },
                ])}
                {selectFilter(
                  "mode",
                  "Expected job mode",
                  "Any mode",
                  JOB_MODES.map((m) => ({ value: m, label: JOB_MODE_LABELS[m as JobMode] })),
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="cf-location">
                    Expected location
                  </Label>
                  <Input
                    id="cf-location"
                    placeholder="e.g. Noida"
                    defaultValue={query.location ?? ""}
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (value !== (query.location ?? "")) {
                        setParams({ location: value || undefined, page: 1 });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                  />
                </div>
                {selectFilter("placementPartnerId", "Placement partner", "Any placement partner", [
                  { value: "none", label: "Not assigned" },
                  ...placementPartners.map((p) => ({ value: p.id, label: p.name })),
                ])}
                {selectFilter("hiringPartnerId", "Hiring partner", "Any hiring partner", [
                  { value: "none", label: "Not assigned" },
                  ...hiringPartners.map((p) => ({ value: p.id, label: p.name })),
                ])}
              </div>
            )}
          </div>
        }
        footer={
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">
              {total} candidate{total === 1 ? "" : "s"}
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

      <CandidateSheet
        candidateId={detailId}
        placementPartners={placementPartners}
        hiringPartners={hiringPartners}
        onOpenChange={(open) => {
          if (open) return;
          setDetailId(null);
          // Opened from a notification link (?candidate=…): drop the id so a
          // reload doesn't pop the sheet open again.
          const url = new URL(window.location.href);
          if (url.searchParams.has("candidate")) {
            url.searchParams.delete("candidate");
            window.history.replaceState(null, "", url);
          }
        }}
        onChanged={() => router.refresh()}
      />

      <AlertDialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this candidate?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.name}&apos;s application and placement history will be permanently
              removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
