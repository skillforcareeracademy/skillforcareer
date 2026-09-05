"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { Activity, Search, Globe, Monitor } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ACTIVITY_LABELS, type ActivityRow } from "@/lib/activity";

/**
 * Admin → Activity: who signed in, when, from where, and what they did after.
 *
 * The client asked for login and activity tracking on learners; this is the
 * whole platform's trail, filterable down to one person, which is the same
 * question asked from the other end. Their individual timeline also appears on
 * the 360 profile.
 */

const ACTION_OPTIONS = [
  { value: "ALL", label: "All activity" },
  ...Object.entries(ACTIVITY_LABELS).map(([value, label]) => ({ value, label })),
];

const TONE: Record<string, string> = {
  "auth.login": "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  "auth.logout": "bg-muted text-muted-foreground",
  "payment.paid": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "course.enroll": "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  "certificate.issued": "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
};

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function ActivityClient({
  rows,
  total,
  query,
}: {
  rows: ActivityRow[];
  total: number;
  query: { page: number; pageSize: number; search?: string; action?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const from = total === 0 ? 0 : (query.page - 1) * query.pageSize + 1;
  const to = Math.min(total, query.page * query.pageSize);

  /** Filters live in the URL, so a filtered view is shareable and survives refresh. */
  function setParams(next: Record<string, string | number | undefined>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === "" || v === "ALL") sp.delete(k);
      else sp.set(k, String(v));
    }
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity"
        description="Sign-ins and what everyone did next — filter by person or by action."
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            defaultValue={query.search ?? ""}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setParams({ search: (e.target as HTMLInputElement).value, page: 1 });
              }
            }}
            placeholder="Search description or IP, then press Enter…"
            className="pl-9"
          />
        </div>
        <Select
          value={query.action ?? "ALL"}
          onValueChange={(v) => setParams({ action: v ?? "ALL", page: 1 })}
        >
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue>
              {(v) => ACTION_OPTIONS.find((o) => o.value === v)?.label ?? "All activity"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ACTION_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        data={rows}
        rowKey={(r) => r.id}
        emptyIcon={Activity}
        emptyTitle="Nothing logged yet"
        emptyDescription="Sign-ins and learner activity appear here as they happen."
        columns={[
          {
            key: "user",
            header: "Who",
            cell: (r) =>
              r.user ? (
                <Link
                  href={`/admin/users/${r.user.id}`}
                  className="hover:text-primary flex items-center gap-2.5"
                >
                  <Avatar className="size-8">
                    {r.user.avatarUrl && (
                      <AvatarImage src={r.user.avatarUrl} alt={r.user.name} />
                    )}
                    <AvatarFallback className="text-[10px]">
                      {initials(r.user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {r.user.name}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {r.user.email}
                    </span>
                  </span>
                </Link>
              ) : (
                <span className="text-muted-foreground text-sm">Signed out visitor</span>
              ),
          },
          {
            key: "action",
            header: "Action",
            cell: (r) => (
              <Badge variant="secondary" className={TONE[r.action] ?? ""}>
                {r.label}
              </Badge>
            ),
          },
          {
            key: "description",
            header: "Detail",
            cell: (r) => (
              <span className="text-muted-foreground line-clamp-2 text-sm">
                {r.description ?? "—"}
              </span>
            ),
          },
          {
            key: "ip",
            header: "From",
            cell: (r) => (
              <span className="text-muted-foreground space-y-0.5 text-xs">
                {r.ip && (
                  <span className="flex items-center gap-1">
                    <Globe className="size-3" /> {r.ip}
                  </span>
                )}
                {r.userAgent && (
                  <span className="flex items-center gap-1">
                    <Monitor className="size-3" />
                    <span className="max-w-[14rem] truncate">{r.userAgent}</span>
                  </span>
                )}
                {!r.ip && !r.userAgent && "—"}
              </span>
            ),
          },
          {
            key: "createdAt",
            header: "When",
            cell: (r) => (
              <span className="text-muted-foreground text-xs whitespace-nowrap">
                {format(new Date(r.createdAt), "d MMM yyyy, h:mm a")}
              </span>
            ),
          },
        ]}
        footer={
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              Showing <span className="font-medium">{from}</span>–
              <span className="font-medium">{to}</span> of{" "}
              <span className="font-medium">{total}</span>
            </p>
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
        renderCard={(r) => (
          <div className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium">{r.user?.name ?? "Signed out visitor"}</p>
              <Badge variant="secondary" className={TONE[r.action] ?? ""}>
                {r.label}
              </Badge>
            </div>
            {r.description && (
              <p className="text-muted-foreground text-sm">{r.description}</p>
            )}
            <p className="text-muted-foreground text-xs">
              {format(new Date(r.createdAt), "d MMM yyyy, h:mm a")}
              {r.ip && ` · ${r.ip}`}
            </p>
          </div>
        )}
      />
    </div>
  );
}
