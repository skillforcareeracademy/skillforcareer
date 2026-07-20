"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Loader2,
  Phone,
  Mail,
  BookOpen,
  MessageSquarePlus,
  Send,
  UserCog,
} from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  type LeadStatus,
} from "@/lib/validations/lead";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_BADGE } from "@/components/admin/leads/lead-badges";

interface Assignee {
  id: string;
  name: string;
}
interface FollowUp {
  id: string;
  note: string;
  status: string | null;
  authorName: string;
  authorAvatar: string | null;
  createdAt: string;
}
interface Detail {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  courseInterest: string | null;
  message: string | null;
  source: string;
  status: string;
  assignedTo: { id: string; name: string } | null;
  createdAt: string;
  followUps: FollowUp[];
}

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function LeadDetailSheet({
  leadId,
  assignees,
  onOpenChange,
}: {
  leadId: string | null;
  assignees: Assignee[];
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={leadId != null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {leadId && <Body leadId={leadId} assignees={assignees} />}
      </SheetContent>
    </Sheet>
  );
}

function Body({ leadId, assignees }: { leadId: string; assignees: Assignee[] }) {
  const router = useRouter();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState(false);
  const [note, setNote] = useState("");
  const [noteStatus, setNoteStatus] = useState<string>("");
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState(false);

  function load() {
    return api.get<Detail>(`/api/leads/${leadId}`).then(setData).catch(() => setError(true));
  }
  useEffect(() => {
    let alive = true;
    api.get<Detail>(`/api/leads/${leadId}`).then((d) => alive && setData(d)).catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [leadId]);

  async function patch(body: Record<string, unknown>, msg: string) {
    setBusy(true);
    try {
      await api.patch(`/api/leads/${leadId}`, body);
      toast.success(msg);
      await load();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function addFollowUp(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setPosting(true);
    try {
      await api.post(`/api/leads/${leadId}/follow-ups`, {
        note,
        status: noteStatus || undefined,
      });
      setNote("");
      setNoteStatus("");
      await load();
      router.refresh();
      toast.success("Follow-up added.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't add follow-up.");
    } finally {
      setPosting(false);
    }
  }

  if (error) {
    return (
      <div className="p-6">
        <SheetHeader className="p-0">
          <SheetTitle>Lead</SheetTitle>
          <SheetDescription>Couldn&apos;t load this lead.</SheetDescription>
        </SheetHeader>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <SheetHeader className="border-b p-6 pb-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-11">
            <AvatarFallback>{initials(data.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <SheetTitle className="truncate">{data.name}</SheetTitle>
            <SheetDescription>
              {STATUS_BADGE(data.status)} · {data.source} · {format(new Date(data.createdAt), "d MMM yyyy")}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="space-y-5 p-6">
        {/* Contact */}
        <div className="grid grid-cols-1 gap-2 text-sm">
          <a href={`tel:${data.phone}`} className="hover:text-primary flex items-center gap-2">
            <Phone className="text-muted-foreground size-4" /> {data.phone}
          </a>
          {data.email && (
            <a href={`mailto:${data.email}`} className="hover:text-primary flex items-center gap-2">
              <Mail className="text-muted-foreground size-4" /> {data.email}
            </a>
          )}
          {data.courseInterest && (
            <p className="flex items-center gap-2">
              <BookOpen className="text-muted-foreground size-4" /> {data.courseInterest}
            </p>
          )}
          {data.message && (
            <p className="text-muted-foreground bg-muted/40 mt-1 rounded-lg p-3 text-sm">
              &ldquo;{data.message}&rdquo;
            </p>
          )}
        </div>

        {/* Status + assignee */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={data.status} onValueChange={(v) => v && patch({ status: v }, "Status updated.")}>
              <SelectTrigger className="w-full" disabled={busy}>
                <SelectValue>{(v) => LEAD_STATUS_LABELS[(v as LeadStatus) ?? "NEW"] ?? "Status"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {LEAD_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <UserCog className="size-3.5" /> Assigned to
            </Label>
            <Select
              value={data.assignedTo?.id ?? "none"}
              onValueChange={(v) => patch({ assignedToId: v === "none" ? "" : v }, "Assignment updated.")}
            >
              <SelectTrigger className="w-full" disabled={busy}>
                <SelectValue>
                  {(v) => (!v || v === "none" ? "Unassigned" : (assignees.find((a) => a.id === v)?.name ?? "—"))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {assignees.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Add follow-up */}
        <form onSubmit={addFollowUp} className="border-t pt-4">
          <Label className="flex items-center gap-1.5">
            <MessageSquarePlus className="size-4" /> Add follow-up remark
          </Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="e.g. Called — interested, will confirm by Friday."
            className="mt-1.5"
          />
          <div className="mt-2 flex items-center gap-2">
            <Select value={noteStatus} onValueChange={(v) => setNoteStatus(v ?? "")}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Set status (optional)">
                  {(v) => (v ? `→ ${LEAD_STATUS_LABELS[v as LeadStatus]}` : "Set status (optional)")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {LEAD_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" size="sm" className="ml-auto" disabled={posting || !note.trim()}>
              {posting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Add
            </Button>
          </div>
        </form>

        {/* Timeline */}
        <div>
          <p className="text-muted-foreground mb-3 text-xs font-medium">
            Follow-up history ({data.followUps.length})
          </p>
          {data.followUps.length === 0 ? (
            <p className="text-muted-foreground text-sm">No follow-ups yet.</p>
          ) : (
            <ol className="space-y-4 border-l pl-4">
              {data.followUps.map((f) => (
                <li key={f.id} className="relative">
                  <span className="bg-primary absolute top-1.5 -left-[21px] size-2 rounded-full ring-4 ring-background" />
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{f.authorName}</span>
                    {f.status && (
                      <Badge variant="secondary" className="text-[10px]">
                        → {LEAD_STATUS_LABELS[f.status as LeadStatus] ?? f.status}
                      </Badge>
                    )}
                    <span className="text-muted-foreground ml-auto text-xs">
                      {format(new Date(f.createdAt), "d MMM, h:mm a")}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm whitespace-pre-wrap">{f.note}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
