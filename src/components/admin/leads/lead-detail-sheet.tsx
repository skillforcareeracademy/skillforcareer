"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Loader2,
  Phone,
  Mail,
  MapPin,
  BookOpen,
  CalendarClock,
  MessageSquarePlus,
  Send,
  Save,
  Bell,
  Paperclip,
  Upload,
  Trash2,
  ExternalLink,
  IndianRupee,
  GraduationCap,
  Briefcase,
} from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LEAD_SUB_STATUSES,
  type LeadStage,
  type LeadSource,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  STAGE_BADGE,
  SUB_STATUS_BADGE,
  QUALITY_BADGE,
  SOURCE_LABEL,
  CLASS_MODE_LABEL,
} from "@/components/admin/leads/lead-badges";
import {
  LeadFormFields,
  blankLeadForm,
  leadFormPayload,
  type CourseOption,
  type LeadFormState,
} from "@/components/admin/leads/lead-form";

interface Assignee {
  id: string;
  name: string;
}
interface FollowUp {
  id: string;
  note: string;
  stage: string | null;
  subStatus: string | null;
  authorName: string;
  authorAvatar: string | null;
  createdAt: string;
}
interface LeadDocument {
  id: string;
  name: string;
  url: string;
  mime: string | null;
  size: number | null;
  createdAt: string;
}
interface Detail {
  id: string;
  leadNo: string | null;
  leadDate: string;
  name: string;
  email: string | null;
  phone: string;
  courseId: string | null;
  courseTitle: string | null;
  courseInterest: string | null;
  whyThisCourse: string | null;
  source: string;
  stage: string;
  subStatus: string | null;
  quality: string | null;
  leadScore: number | null;
  classMode: string | null;
  qualification: string | null;
  jobStatus: string | null;
  experiencedIn: string | null;
  address: string | null;
  expectedVisit: string | null;
  visitDate: string | null;
  visitTime: string | null;
  followUpDate: string | null;
  followUpTime: string | null;
  message: string | null;
  feesOffered: number | null;
  finalFees: number | null;
  emiCount: number | null;
  assignedTo: { id: string; name: string } | null;
  lastRemindedAt: string | null;
  createdAt: string;
  documents: LeadDocument[];
  followUps: FollowUp[];
}

const MAX_DOC_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DOC_ACCEPT =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.zip,.jpg,.jpeg,.png,.webp,application/pdf,image/*";

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const inr = (n: number | null) =>
  n == null ? null : `₹${n.toLocaleString("en-IN")}`;

function fileSize(bytes: number | null): string {
  if (!bytes) return "";
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Detail → the editable form shape. */
function toForm(d: Detail): LeadFormState {
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
  return {
    ...blankLeadForm(),
    leadDate: day(d.leadDate),
    source: d.source as LeadSource,
    quality: d.quality ?? "",
    leadScore: d.leadScore != null ? String(d.leadScore) : "",
    name: d.name,
    phone: d.phone,
    email: d.email ?? "",
    courseId: d.courseId ?? "",
    courseInterest: d.courseInterest ?? "",
    whyThisCourse: d.whyThisCourse ?? "",
    stage: d.stage as LeadStage,
    subStatus: d.subStatus ?? "",
    qualification: d.qualification ?? "",
    jobStatus: d.jobStatus ?? "",
    experiencedIn: d.experiencedIn ?? "",
    address: d.address ?? "",
    classMode: d.classMode ?? "",
    expectedVisit: d.expectedVisit ?? "",
    visitDate: day(d.visitDate),
    visitTime: d.visitTime ?? "",
    followUpDate: day(d.followUpDate),
    followUpTime: d.followUpTime ?? "",
    message: d.message ?? "",
    feesOffered: d.feesOffered != null ? String(d.feesOffered) : "",
    finalFees: d.finalFees != null ? String(d.finalFees) : "",
    emiCount: d.emiCount != null ? String(d.emiCount) : "",
    assignedToId: d.assignedTo?.id ?? "",
  };
}

export function LeadDetailSheet({
  leadId,
  assignees,
  courses,
  onOpenChange,
}: {
  leadId: string | null;
  assignees: Assignee[];
  courses: CourseOption[];
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={leadId != null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {leadId && (
          // Remount per lead: the form and the phone field both seed from the
          // first render's data, so reusing the instance would show stale values.
          <Body
            key={leadId}
            leadId={leadId}
            assignees={assignees}
            courses={courses}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Body({
  leadId,
  assignees,
  courses,
}: {
  leadId: string;
  assignees: Assignee[];
  courses: CourseOption[];
}) {
  const router = useRouter();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState(false);
  const [form, setForm] = useState<LeadFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [noteStage, setNoteStage] = useState<string>("");
  const [noteSubStatus, setNoteSubStatus] = useState<string>("");
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("");
  const [posting, setPosting] = useState(false);
  const [reminding, setReminding] = useState<"EMAIL" | "SMS" | "BOTH" | null>(
    null,
  );
  const [uploading, setUploading] = useState(false);

  function load(seedForm = false) {
    return api
      .get<Detail>(`/api/leads/${leadId}`)
      .then((d) => {
        setData(d);
        if (seedForm) setForm(toForm(d));
      })
      .catch(() => setError(true));
  }

  useEffect(() => {
    let alive = true;
    api
      .get<Detail>(`/api/leads/${leadId}`)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setForm(toForm(d));
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [leadId]);

  async function saveDetails(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      await api.patch(`/api/leads/${leadId}`, leadFormPayload(form));
      toast.success("Lead updated.");
      await load();
      router.refresh();
    } catch (err) {
      const d =
        err instanceof ApiError
          ? (err.details as { issues?: { message: string }[] })
          : undefined;
      toast.error(
        d?.issues?.[0]?.message ??
          (err instanceof ApiError ? err.message : "Update failed."),
      );
    } finally {
      setSaving(false);
    }
  }

  async function addFollowUp(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setPosting(true);
    try {
      await api.post(`/api/leads/${leadId}/follow-ups`, {
        note,
        stage: noteStage || undefined,
        subStatus: noteSubStatus || undefined,
        followUpDate: nextDate || undefined,
        followUpTime: nextTime || undefined,
      });
      setNote("");
      setNoteStage("");
      setNoteSubStatus("");
      setNextDate("");
      setNextTime("");
      await load(true);
      router.refresh();
      toast.success("Follow-up added.");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Couldn't add follow-up.",
      );
    } finally {
      setPosting(false);
    }
  }

  async function sendReminder(channels: ("EMAIL" | "SMS")[]) {
    setReminding(channels.length > 1 ? "BOTH" : channels[0]);
    try {
      const res = await api.post<{ message: string; notes: string[] }>(
        `/api/leads/${leadId}/remind`,
        { channels },
      );
      toast.success(res.message);
      if (res.notes?.length) toast.warning(res.notes.join(" "));
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Reminder failed.");
    } finally {
      setReminding(null);
    }
  }

  async function uploadDocument(file: File) {
    // An Aadhaar or marksheet is as often a phone photo as a PDF, so images go
    // up the image route (5 MB cap) and everything else the document route.
    const isImage = file.type.startsWith("image/");
    const cap = isImage ? MAX_IMAGE_BYTES : MAX_DOC_BYTES;
    if (file.size > cap) {
      toast.error(
        isImage ? "Image must be under 5 MB." : "File must be under 25 MB.",
      );
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", isImage ? "image" : "doc");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success)
        throw new Error(json?.error?.message ?? "Upload failed.");

      await api.post(`/api/leads/${leadId}/documents`, {
        name: file.name,
        url: json.data.url as string,
        mime: file.type || undefined,
        size: file.size,
      });
      toast.success(`${file.name} attached.`);
      await load();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function removeDocument(doc: LeadDocument) {
    try {
      await api.del(`/api/leads/${leadId}/documents/${doc.id}`);
      toast.success("Document removed.");
      await load();
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Couldn't remove that document.",
      );
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
  if (!data || !form) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  const course = data.courseTitle ?? data.courseInterest;
  const noteSubStatuses = noteStage
    ? (LEAD_SUB_STATUSES[noteStage as LeadStage] ?? [])
    : [];

  return (
    <div className="flex flex-col">
      <SheetHeader className="border-b p-6 pb-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-11">
            <AvatarFallback>{initials(data.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <SheetTitle className="flex items-center gap-2 truncate">
              {data.name}
              {data.leadNo && (
                <Badge variant="outline" className="font-mono text-[10px]">
                  {data.leadNo}
                </Badge>
              )}
            </SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-1.5">
              {STAGE_BADGE(data.stage)}
              {SUB_STATUS_BADGE(data.subStatus)}
              {QUALITY_BADGE(data.quality)}
              <span className="text-muted-foreground text-xs">
                {SOURCE_LABEL(data.source)} ·{" "}
                {format(new Date(data.leadDate), "d MMM yyyy")}
              </span>
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <Tabs defaultValue="overview" className="p-6">
        <TabsList className="w-full">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="documents">
            Docs ({data.documents.length})
          </TabsTrigger>
          <TabsTrigger value="followups">
            Follow-ups ({data.followUps.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Overview ─────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-5 pt-4">
          <div className="grid gap-2 text-sm">
            <a
              href={`tel:${data.phone}`}
              className="hover:text-primary flex items-center gap-2"
            >
              <Phone className="text-muted-foreground size-4" /> {data.phone}
            </a>
            {data.email && (
              <a
                href={`mailto:${data.email}`}
                className="hover:text-primary flex items-center gap-2"
              >
                <Mail className="text-muted-foreground size-4" /> {data.email}
              </a>
            )}
            {course && (
              <p className="flex items-center gap-2">
                <BookOpen className="text-muted-foreground size-4" /> {course}
                {data.classMode && (
                  <span className="text-muted-foreground text-xs">
                    ({CLASS_MODE_LABEL(data.classMode)})
                  </span>
                )}
              </p>
            )}
            {data.address && (
              <p className="flex items-center gap-2">
                <MapPin className="text-muted-foreground size-4" />{" "}
                {data.address}
              </p>
            )}
          </div>

          {data.whyThisCourse && (
            <p className="text-muted-foreground bg-muted/40 rounded-lg p-3 text-sm">
              <span className="text-foreground font-medium">
                Why this course:{" "}
              </span>
              {data.whyThisCourse}
            </p>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Fact
              label="Lead score"
              value={data.leadScore != null ? `${data.leadScore} / 100` : null}
            />
            <Fact label="Lead source" value={SOURCE_LABEL(data.source)} />
            <Fact
              icon={GraduationCap}
              label="Qualification"
              value={data.qualification}
            />
            <Fact icon={Briefcase} label="Job status" value={data.jobStatus} />
            <Fact label="Experienced in" value={data.experiencedIn} />
            <Fact
              icon={CalendarClock}
              label="Expected visit"
              value={
                data.expectedVisit ??
                (data.visitDate
                  ? format(new Date(data.visitDate), "d MMM yyyy")
                  : null)
              }
            />
            <Fact
              label="Visit date / time"
              value={
                data.visitDate
                  ? `${format(new Date(data.visitDate), "d MMM yyyy")}${data.visitTime ? ` · ${data.visitTime}` : ""}`
                  : (data.visitTime ?? null)
              }
            />
            <Fact
              icon={CalendarClock}
              label="Next follow-up"
              value={
                data.followUpDate
                  ? `${format(new Date(data.followUpDate), "d MMM yyyy")}${data.followUpTime ? ` · ${data.followUpTime}` : ""}`
                  : null
              }
            />
            <Fact
              icon={IndianRupee}
              label="Fees offered"
              value={inr(data.feesOffered)}
            />
            <Fact label="Final fees" value={inr(data.finalFees)} />
            <Fact
              label="No. of EMI"
              value={data.emiCount != null ? String(data.emiCount) : null}
            />
            <Fact label="Assigned to" value={data.assignedTo?.name ?? null} />
            <Fact
              label="Last reminded"
              value={
                data.lastRemindedAt
                  ? format(new Date(data.lastRemindedAt), "d MMM, h:mm a")
                  : null
              }
            />
          </dl>

          {data.message && (
            <div>
              <p className="text-muted-foreground mb-1 text-xs font-medium">
                Notes
              </p>
              <p className="bg-muted/40 rounded-lg p-3 text-sm whitespace-pre-wrap">
                {data.message}
              </p>
            </div>
          )}

          <div className="border-t pt-4">
            <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium">
              <Bell className="size-3.5" /> Send a reminder
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={reminding != null || !data.email}
                onClick={() => sendReminder(["EMAIL"])}
              >
                {reminding === "EMAIL" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Mail className="size-4" />
                )}
                Email
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={reminding != null}
                onClick={() => sendReminder(["SMS"])}
              >
                {reminding === "SMS" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Phone className="size-4" />
                )}
                SMS
              </Button>
              <Button
                size="sm"
                disabled={reminding != null}
                onClick={() => sendReminder(["EMAIL", "SMS"])}
              >
                {reminding === "BOTH" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Both
              </Button>
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              Leads with a visit date are also reminded automatically the day
              before.
            </p>
          </div>
        </TabsContent>

        {/* ── Edit ─────────────────────────────────────────────────────── */}
        <TabsContent value="edit" className="pt-4">
          <form onSubmit={saveDetails} className="space-y-4">
            <LeadFormFields
              form={form}
              onChange={(patch) => setForm((f) => (f ? { ...f, ...patch } : f))}
              courses={courses}
              assignees={assignees}
              disabled={saving}
            />
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setForm(toForm(data))}
                disabled={saving}
              >
                Reset
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save changes
              </Button>
            </div>
          </form>
        </TabsContent>

        {/* ── Documents ────────────────────────────────────────────────── */}
        <TabsContent value="documents" className="space-y-4 pt-4">
          <label className="border-muted-foreground/25 hover:bg-muted/40 flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed p-6 text-center transition-colors">
            {uploading ? (
              <Loader2 className="text-muted-foreground size-5 animate-spin" />
            ) : (
              <Upload className="text-muted-foreground size-5" />
            )}
            <span className="text-sm font-medium">
              {uploading ? "Uploading…" : "Upload a document"}
            </span>
            <span className="text-muted-foreground text-xs">
              Aadhaar, marksheet, resume — PDF, Word, Excel (25 MB) or a photo
              (5 MB)
            </span>
            <input
              type="file"
              accept={DOC_ACCEPT}
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void uploadDocument(file);
              }}
            />
          </label>

          {data.documents.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No documents attached yet.
            </p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {data.documents.map((doc) => (
                <li key={doc.id} className="flex items-center gap-3 p-3">
                  <Paperclip className="text-muted-foreground size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{doc.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {[
                        fileSize(doc.size),
                        format(new Date(doc.createdAt), "d MMM yyyy"),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    nativeButton={false}
                    render={
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    }
                  >
                    <ExternalLink className="size-4" /> View
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive"
                    aria-label={`Remove ${doc.name}`}
                    onClick={() => removeDocument(doc)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        {/* ── Follow-ups ───────────────────────────────────────────────── */}
        <TabsContent value="followups" className="space-y-5 pt-4">
          <form onSubmit={addFollowUp}>
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
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Select
                value={noteStage}
                onValueChange={(v) => {
                  setNoteStage(v ?? "");
                  setNoteSubStatus("");
                }}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Move to stage (optional)">
                    {(v) =>
                      v
                        ? `→ ${LEAD_STAGE_LABELS[v as LeadStage]}`
                        : "Move to stage (optional)"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LEAD_STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {LEAD_STAGE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {noteStage && (
                <Select
                  value={noteSubStatus}
                  onValueChange={(v) => setNoteSubStatus(v ?? "")}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Status (optional)">
                      {(v) => (v ? String(v) : "Status (optional)")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {noteSubStatuses.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                type="submit"
                size="sm"
                className="ml-auto"
                disabled={posting || !note.trim()}
              >
                {posting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Add
              </Button>
            </div>

            {/* Booking the next call-back here saves a trip to the Edit tab —
                it's the same two fields on the lead, and a reminder follows. */}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fu-next-date" className="text-xs">
                  Next follow-up date
                </Label>
                <Input
                  id="fu-next-date"
                  type="date"
                  value={nextDate}
                  onChange={(e) => setNextDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fu-next-time" className="text-xs">
                  Next follow-up time
                </Label>
                <Input
                  id="fu-next-time"
                  type="time"
                  value={nextTime}
                  onChange={(e) => setNextTime(e.target.value)}
                />
              </div>
            </div>
          </form>

          {data.followUps.length === 0 ? (
            <p className="text-muted-foreground text-sm">No follow-ups yet.</p>
          ) : (
            <ol className="space-y-4 border-l pl-4">
              {data.followUps.map((f) => (
                <li key={f.id} className="relative">
                  <span className="bg-primary ring-background absolute top-1.5 -left-[21px] size-2 rounded-full ring-4" />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{f.authorName}</span>
                    {f.stage && (
                      <Badge variant="secondary" className="text-[10px]">
                        → {LEAD_STAGE_LABELS[f.stage as LeadStage] ?? f.stage}
                        {f.subStatus ? ` · ${f.subStatus}` : ""}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground flex items-center gap-1 text-xs">
        {Icon && <Icon className="size-3" />}
        {label}
      </dt>
      <dd className="truncate">
        {value ?? <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}
