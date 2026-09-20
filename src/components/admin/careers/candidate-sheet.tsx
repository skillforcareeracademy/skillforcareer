"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import {
  BookOpen,
  Briefcase,
  CalendarClock,
  Download,
  FileText,
  History,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Save,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import {
  CANDIDATE_STATUSES,
  CANDIDATE_STATUS_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  JOB_MODE_LABELS,
  type CandidateStatus,
} from "@/lib/validations/careers";
import type {
  CandidateRow,
  HiringPartnerRow,
  PartnerRow,
  TimelineEntry,
} from "@/server/services/careers-service";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { LevelBadge, StatusBadge } from "@/components/admin/careers/career-badges";
import { apiErrorMessage } from "@/components/admin/careers/partner-dialog";

type Detail = CandidateRow & { timeline: TimelineEntry[] };

const NONE = "none";

interface PlacementForm {
  status: CandidateStatus;
  placementPartnerId: string;
  hiringPartnerId: string;
  hiringPostId: string;
  placedAt: string;
  placedCompany: string;
  placedRole: string;
  placedPackage: string;
  adminNotes: string;
}

function toForm(d: Detail): PlacementForm {
  return {
    status: d.status,
    placementPartnerId: d.placementPartnerId ?? NONE,
    hiringPartnerId: d.hiringPartnerId ?? NONE,
    hiringPostId: d.hiringPostId ?? NONE,
    placedAt: d.placedAt ? d.placedAt.slice(0, 10) : "",
    placedCompany: d.placedCompany ?? "",
    placedRole: d.placedRole ?? "",
    placedPackage: d.placedPackage ?? "",
    adminNotes: d.adminNotes ?? "",
  };
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const today = () => format(new Date(), "yyyy-MM-dd");

export function CandidateSheet({
  candidateId,
  placementPartners,
  hiringPartners,
  onOpenChange,
  onChanged,
}: {
  candidateId: string | null;
  placementPartners: PartnerRow[];
  hiringPartners: HiringPartnerRow[];
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  return (
    <Sheet open={candidateId != null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {candidateId && (
          // Remount per candidate: the form seeds from the first load.
          <Body
            key={candidateId}
            candidateId={candidateId}
            placementPartners={placementPartners}
            hiringPartners={hiringPartners}
            onChanged={onChanged}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Body({
  candidateId,
  placementPartners,
  hiringPartners,
  onChanged,
}: {
  candidateId: string;
  placementPartners: PartnerRow[];
  hiringPartners: HiringPartnerRow[];
  onChanged: () => void;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState(false);
  const [form, setForm] = useState<PlacementForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<string>("details");

  useEffect(() => {
    let alive = true;
    api
      .get<Detail>(`/api/admin/careers/candidates/${candidateId}`)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setForm(toForm(d));
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [candidateId]);

  if (error) {
    return (
      <div className="p-6">
        <SheetHeader className="p-0">
          <SheetTitle>Candidate</SheetTitle>
          <SheetDescription>Couldn&apos;t load this candidate — they may have been deleted.</SheetDescription>
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

  const hiringPartner = hiringPartners.find((p) => p.id === form.hiringPartnerId) ?? null;

  // Inactive partners and closed posts drop out of the pickers — except the one
  // this candidate already has, which must still show by name.
  const placementOptions = placementPartners.filter(
    (p) => p.isActive || p.id === data.placementPartnerId,
  );
  const hiringOptions = hiringPartners.filter((p) => p.isActive || p.id === data.hiringPartnerId);
  const postOptions = (hiringPartner?.posts ?? []).filter(
    (p) => p.isOpen || p.id === data.hiringPostId,
  );

  function set<K extends keyof PlacementForm>(key: K, value: PlacementForm[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  function pickStatus(status: CandidateStatus) {
    setForm((f) => {
      if (!f) return f;
      if (status !== "PLACED") return { ...f, status };
      // Marking placed: start the placement details from what we already know.
      const partner = hiringPartners.find((p) => p.id === f.hiringPartnerId);
      const post = partner?.posts.find((p) => p.id === f.hiringPostId);
      return {
        ...f,
        status,
        placedAt: f.placedAt || today(),
        placedCompany: f.placedCompany || partner?.name || "",
        placedRole: f.placedRole || post?.title || data?.jobExpecting || "",
      };
    });
  }

  function pickHiringPartner(id: string) {
    setForm((f) => {
      if (!f) return f;
      const partner = hiringPartners.find((p) => p.id === id);
      const keepPost = partner?.posts.some((p) => p.id === f.hiringPostId);
      return { ...f, hiringPartnerId: id, hiringPostId: keepPost ? f.hiringPostId : NONE };
    });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (form.status === "PLACED" && (!form.placedCompany.trim() || !form.placedAt)) {
      toast.error("To mark a candidate placed, add the company and the date they were placed.");
      setTab("placement");
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/api/admin/careers/candidates/${candidateId}`, {
        status: form.status,
        placementPartnerId: form.placementPartnerId === NONE ? null : form.placementPartnerId,
        hiringPartnerId: form.hiringPartnerId === NONE ? null : form.hiringPartnerId,
        hiringPostId: form.hiringPostId === NONE ? null : form.hiringPostId,
        placedAt: form.placedAt || null,
        placedCompany: form.placedCompany,
        placedRole: form.placedRole,
        placedPackage: form.placedPackage,
        adminNotes: form.adminNotes,
      });
      toast.success("Candidate updated.");
      const fresh = await api.get<Detail>(`/api/admin/careers/candidates/${candidateId}`);
      setData(fresh);
      setForm(toForm(fresh));
      onChanged();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Update failed."));
    } finally {
      setSaving(false);
    }
  }

  const whatsapp = data.phone.replace(/[^\d]/g, "");
  const placedDetailsRequired = form.status === "PLACED";

  return (
    <div className="flex flex-col">
      <SheetHeader className="border-b p-6 pb-4">
        <div className="flex items-center gap-3 pr-8">
          <Avatar className="size-11">
            <AvatarFallback>{initials(data.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <SheetTitle className="truncate">{data.name}</SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={data.status} />
              <LevelBadge level={data.experienceLevel} />
              <span className="text-muted-foreground text-xs">
                Received {format(new Date(data.createdAt), "d MMM yyyy")}
              </span>
            </SheetDescription>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<a href={`tel:${data.phone.replace(/[^+\d]/g, "")}`} />}
          >
            <Phone className="size-4" /> Call
          </Button>
          {whatsapp.length >= 10 && (
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" />}
            >
              <MessageCircle className="size-4" /> WhatsApp
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<a href={`mailto:${data.email}`} />}
          >
            <Mail className="size-4" /> Email
          </Button>
          {data.cvUrl && (
            <Button
              size="sm"
              nativeButton={false}
              render={<a href={data.cvUrl} target="_blank" rel="noopener noreferrer" />}
            >
              <Download className="size-4" /> CV
            </Button>
          )}
        </div>
      </SheetHeader>

      <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="p-6">
        <TabsList className="w-full">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="placement">Placement</TabsTrigger>
          <TabsTrigger value="timeline">Timeline ({data.timeline.length + 1})</TabsTrigger>
        </TabsList>

        {/* ── Everything they sent ─────────────────────────────────────── */}
        <TabsContent value="details" className="space-y-5 pt-4">
          <Group icon={UserRound} title="Contact">
            <Row label="Phone">{data.phone}</Row>
            <Row label="Email">
              <a href={`mailto:${data.email}`} className="hover:text-primary break-all">
                {data.email}
              </a>
            </Row>
            <Row label="Current address">{data.currentAddress}</Row>
            {data.userId && (
              <Row label="Account">
                <Link href={`/admin/users/${data.userId}`} className="text-primary hover:underline">
                  Registered learner — open profile
                </Link>
              </Row>
            )}
          </Group>

          <Group icon={BookOpen} title="Training">
            <Row label="Course">{data.courseName}</Row>
            <Row label="Batch (certificate)">
              {data.batchCode && <span className="font-mono">{data.batchCode}</span>}
            </Row>
          </Group>

          <Group icon={Briefcase} title="Job wanted">
            <Row label="Role">{data.jobExpecting}</Row>
            <Row label="Level">{EXPERIENCE_LEVEL_LABELS[data.experienceLevel]}</Row>
            {data.experienceLevel === "EXPERIENCED" && (
              <Row label="Experience">
                <span className="whitespace-pre-wrap">{data.experienceDetails}</span>
              </Row>
            )}
            <Row label="Location">{data.expectedLocation}</Row>
            <Row label="Mode">{data.expectedMode ? JOB_MODE_LABELS[data.expectedMode] : null}</Row>
            <Row label="Can join">{data.joiningAvailability}</Row>
          </Group>

          {data.cvUrl && (
            <a
              href={data.cvUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:bg-muted/60 flex items-center gap-3 rounded-xl border p-3 transition-colors"
            >
              <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg">
                <FileText className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{data.cvName ?? "CV"}</span>
                <span className="text-muted-foreground block text-xs">Open or download</span>
              </span>
              <Download className="text-muted-foreground size-4" />
            </a>
          )}
        </TabsContent>

        {/* ── Where they are in placement ──────────────────────────────── */}
        <TabsContent value="placement" className="pt-4">
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => v && pickStatus(v as CandidateStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v) => CANDIDATE_STATUS_LABELS[v as CandidateStatus]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CANDIDATE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {CANDIDATE_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Placement partner</Label>
              <Select
                value={form.placementPartnerId}
                onValueChange={(v) => v && set("placementPartnerId", String(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) =>
                      v === NONE
                        ? "Not assigned"
                        : (placementPartners.find((p) => p.id === v)?.name ?? "Not assigned")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not assigned</SelectItem>
                  {placementOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {!p.isActive && " (inactive)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Hiring partner</Label>
                <Select value={form.hiringPartnerId} onValueChange={(v) => v && pickHiringPartner(String(v))}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) =>
                        v === NONE
                          ? "Not assigned"
                          : (hiringPartners.find((p) => p.id === v)?.name ?? "Not assigned")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not assigned</SelectItem>
                    {hiringOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {!p.isActive && " (inactive)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Post</Label>
                <Select
                  value={form.hiringPostId}
                  onValueChange={(v) => v && set("hiringPostId", String(v))}
                  disabled={!hiringPartner}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) =>
                        v === NONE
                          ? hiringPartner
                            ? "No specific post"
                            : "Pick a hiring partner first"
                          : (hiringPartner?.posts.find((p) => p.id === v)?.title ?? "No specific post")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No specific post</SelectItem>
                    {postOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title} · {EXPERIENCE_LEVEL_LABELS[p.level]}
                        {!p.isOpen && " (closed)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <fieldset className="space-y-3 rounded-xl border p-4">
              <legend className="px-1 text-sm font-medium">Placement details</legend>
              <p className="text-muted-foreground -mt-1 text-xs">
                {placedDetailsRequired
                  ? "Company and date are needed to mark this candidate placed."
                  : "Fill these in when the candidate is placed."}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cs-company">
                    Company{placedDetailsRequired && <span className="text-destructive"> *</span>}
                  </Label>
                  <Input
                    id="cs-company"
                    value={form.placedCompany}
                    onChange={(e) => set("placedCompany", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cs-date">
                    Placed on{placedDetailsRequired && <span className="text-destructive"> *</span>}
                  </Label>
                  <Input
                    id="cs-date"
                    type="date"
                    value={form.placedAt}
                    onChange={(e) => set("placedAt", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cs-role">Role</Label>
                  <Input
                    id="cs-role"
                    value={form.placedRole}
                    onChange={(e) => set("placedRole", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cs-package">Package</Label>
                  <Input
                    id="cs-package"
                    value={form.placedPackage}
                    onChange={(e) => set("placedPackage", e.target.value)}
                    placeholder="e.g. 3.2 LPA"
                  />
                </div>
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="cs-notes">Admin notes</Label>
              <Textarea
                id="cs-notes"
                rows={4}
                value={form.adminNotes}
                onChange={(e) => set("adminNotes", e.target.value)}
                placeholder="Interview feedback, follow-ups, anything the team should know."
              />
            </div>

            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save changes
            </Button>
          </form>
        </TabsContent>

        {/* ── Who changed what, and when ───────────────────────────────── */}
        <TabsContent value="timeline" className="pt-4">
          <ol className="relative space-y-4 border-l pl-5">
            {data.timeline.map((t) => (
              <li key={t.id} className="relative">
                <span className="bg-primary absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-[var(--popover)]" />
                <p className="text-sm">{t.description}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {t.by ? `${t.by} · ` : ""}
                  <span title={format(new Date(t.at), "d MMM yyyy, h:mm a")}>
                    {formatDistanceToNow(new Date(t.at), { addSuffix: true })}
                  </span>
                </p>
              </li>
            ))}
            <li className="relative">
              <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-emerald-500 ring-4 ring-[var(--popover)]" />
              <p className="flex items-center gap-1.5 text-sm">
                <History className="text-muted-foreground size-3.5" /> CV received from the careers
                page
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {format(new Date(data.createdAt), "d MMM yyyy, h:mm a")}
              </p>
            </li>
          </ol>
          {data.placedAt && data.status === "PLACED" && (
            <p className="text-muted-foreground mt-5 flex items-center gap-1.5 text-xs">
              <CalendarClock className="size-3.5" /> Placed on{" "}
              {format(new Date(data.placedAt), "d MMM yyyy")}
              {data.placedCompany ? ` at ${data.placedCompany}` : ""}
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Group({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof MapPin;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Icon className="text-muted-foreground size-4" /> {title}
      </h3>
      <dl className="divide-y rounded-xl border">{children}</dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 px-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}
