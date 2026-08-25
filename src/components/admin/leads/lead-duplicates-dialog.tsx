"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { CheckCircle2, Copy, Loader2, Mail, Phone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  STAGE_BADGE,
  SUB_STATUS_BADGE,
  SOURCE_LABEL,
} from "@/components/admin/leads/lead-badges";

interface DuplicateLead {
  id: string;
  leadNo: string | null;
  name: string;
  phone: string;
  email: string | null;
  stage: string;
  subStatus: string | null;
  source: string;
  leadDate: string;
  followUps: number;
  documents: number;
}
interface DuplicateGroup {
  key: string;
  matchedOn: "phone" | "email";
  leads: DuplicateLead[];
}
interface DuplicateReport {
  groups: DuplicateGroup[];
  scanned: number;
  duplicates: number;
}

/**
 * Duplicate cleanup. Leads that share a phone number or an email are grouped;
 * within each group the oldest is kept and the rest are pre-ticked for removal,
 * which is the usual outcome — but every tick is editable, because the newer
 * row sometimes carries the follow-ups worth keeping.
 */
export function LeadDuplicatesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {/* Mounted only while open, so each visit re-scans from scratch. */}
        {open && <Body onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [report, setReport] = useState<DuplicateReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState(false);

  /** Default the ticks to "keep the original" — the first, oldest of each group. */
  const apply = useCallback((res: DuplicateReport) => {
    setReport(res);
    setSelected(
      new Set(res.groups.flatMap((g) => g.leads.slice(1).map((l) => l.id))),
    );
    setLoading(false);
  }, []);

  const onScanFailed = useCallback((err: unknown) => {
    toast.error(
      err instanceof ApiError ? err.message : "Couldn't scan for duplicates.",
    );
    setLoading(false);
  }, []);

  const rescan = useCallback(
    () =>
      api
        .get<DuplicateReport>("/api/leads/duplicates")
        .then(apply, onScanFailed),
    [apply, onScanFailed],
  );

  useEffect(() => {
    let alive = true;
    api.get<DuplicateReport>("/api/leads/duplicates").then(
      (res) => alive && apply(res),
      (err) => alive && onScanFailed(err),
    );
    return () => {
      alive = false;
    };
  }, [apply, onScanFailed]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function removeSelected() {
    setRemoving(true);
    try {
      const res = await api.post<{ removed: number; message: string }>(
        "/api/leads/duplicates",
        {
          ids: [...selected],
        },
      );
      toast.success(res.message);
      router.refresh();
      await rescan();
    } catch (err) {
      const d =
        err instanceof ApiError
          ? (err.details as { issues?: { message: string }[] })
          : undefined;
      toast.error(
        d?.issues?.[0]?.message ??
          (err instanceof ApiError ? err.message : "Couldn't remove them."),
      );
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Duplicate leads</DialogTitle>
        <DialogDescription>
          Leads sharing a phone number or an email. The oldest in each group is
          kept by default.
        </DialogDescription>
      </DialogHeader>

      {loading && !report ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : !report || report.groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <CheckCircle2 className="size-8 text-emerald-500" />
          <p className="font-medium">No duplicates found</p>
          <p className="text-muted-foreground text-sm">
            Scanned {report?.scanned ?? 0} lead
            {report?.scanned === 1 ? "" : "s"} — every phone number and email is
            unique.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            <strong className="text-foreground">{report.duplicates}</strong>{" "}
            duplicate
            {report.duplicates === 1 ? "" : "s"} across {report.groups.length}{" "}
            group
            {report.groups.length === 1 ? "" : "s"} · {selected.size} ticked for
            removal
          </p>

          {report.groups.map((group) => (
            <div
              key={`${group.matchedOn}-${group.key}`}
              className="rounded-xl border"
            >
              <div className="text-muted-foreground bg-muted/40 flex items-center gap-1.5 rounded-t-xl border-b px-3 py-2 text-xs">
                {group.matchedOn === "phone" ? (
                  <Phone className="size-3.5" />
                ) : (
                  <Mail className="size-3.5" />
                )}
                Same {group.matchedOn}:{" "}
                <span className="text-foreground">{group.key}</span>
                <span className="ml-auto">{group.leads.length} leads</span>
              </div>
              <ul className="divide-y">
                {group.leads.map((lead, index) => (
                  <li key={lead.id} className="flex items-start gap-3 p-3">
                    <Checkbox
                      className="mt-1"
                      checked={selected.has(lead.id)}
                      onCheckedChange={() => toggle(lead.id)}
                      aria-label={`Remove ${lead.name}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium">
                          {lead.name}
                        </span>
                        {lead.leadNo && (
                          <span className="text-muted-foreground font-mono text-xs">
                            {lead.leadNo}
                          </span>
                        )}
                        {index === 0 && (
                          <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                            oldest
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {STAGE_BADGE(lead.stage)}
                        {SUB_STATUS_BADGE(lead.subStatus)}
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {SOURCE_LABEL(lead.source)} ·{" "}
                        {format(new Date(lead.leadDate), "d MMM yyyy")}
                        {lead.followUps > 0 &&
                          ` · ${lead.followUps} follow-up${lead.followUps === 1 ? "" : "s"}`}
                        {lead.documents > 0 &&
                          ` · ${lead.documents} doc${lead.documents === 1 ? "" : "s"}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
        {report && report.groups.length > 0 && (
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              <Copy className="size-4" /> Keep all
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={removing || selected.size === 0}
              onClick={removeSelected}
            >
              {removing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Remove {selected.size} selected
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  );
}
