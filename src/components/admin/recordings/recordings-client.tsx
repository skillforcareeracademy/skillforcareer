"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Download,
  Film,
  Loader2,
  PlayCircle,
  Search,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RecordingPlayer } from "@/components/student/recording-player";
import type {
  AdminRecordingRow,
  AdminRequestRow,
} from "@/server/services/recording-request-service";

const ALL = "__all";

interface BatchOption {
  id: string;
  name: string;
  courseTitle: string;
}

type SortKey = "date-desc" | "date-asc" | "title" | "course" | "batch";

const SORT_LABEL: Record<SortKey, string> = {
  "date-desc": "Newest first",
  "date-asc": "Oldest first",
  title: "Title A–Z",
  course: "By course",
  batch: "By batch",
};

const SORTERS: Record<
  SortKey,
  (a: AdminRecordingRow, b: AdminRecordingRow) => number
> = {
  "date-desc": (a, b) => b.scheduledStart.localeCompare(a.scheduledStart),
  "date-asc": (a, b) => a.scheduledStart.localeCompare(b.scheduledStart),
  title: (a, b) => a.title.localeCompare(b.title),
  course: (a, b) =>
    (a.courseTitle ?? "").localeCompare(b.courseTitle ?? "") ||
    b.scheduledStart.localeCompare(a.scheduledStart),
  batch: (a, b) =>
    (a.batchName ?? "").localeCompare(b.batchName ?? "") ||
    b.scheduledStart.localeCompare(a.scheduledStart),
};

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** One learner request: share it (free or priced), or decline it. */
function RequestCard({ r }: { r: AdminRequestRow }) {
  const router = useRouter();
  const [price, setPrice] = useState("");
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState<null | "approve" | "decline">(null);

  async function approve() {
    setBusy("approve");
    try {
      const amount = Number(price) || 0;
      await api.patch(`/api/recordings/requests/${r.id}`, {
        action: "approve",
        price: amount,
        accessDays: Number(days) || 30,
      });
      toast.success(
        amount > 0
          ? "Approved — the learner can pay to unlock it."
          : "Shared — the learner can watch it now.",
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't do that.");
      setBusy(null);
    }
  }

  async function decline() {
    setBusy("decline");
    try {
      await api.patch(`/api/recordings/requests/${r.id}`, { action: "decline" });
      toast.success("Request declined.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't do that.");
      setBusy(null);
    }
  }

  const awaiting = r.status === "AWAITING_PAYMENT";

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-start gap-3">
        <Avatar className="size-9">
          {r.learnerAvatar && <AvatarImage src={r.learnerAvatar} alt={r.learnerName} />}
          <AvatarFallback className="bg-gradient-to-br from-rose-500 to-pink-600 text-xs font-semibold text-white">
            {initials(r.learnerName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{r.learnerName}</p>
          <p className="text-muted-foreground truncate text-xs">{r.learnerEmail}</p>
        </div>
        {awaiting && (
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Clock className="size-3" /> Awaiting ₹{(r.price ?? 0).toLocaleString("en-IN")}
          </Badge>
        )}
      </div>

      <div className="text-muted-foreground space-y-1 text-xs">
        <p className="flex items-center gap-1.5">
          <Film className="size-3.5 shrink-0" />
          <span className="text-foreground font-medium">{r.meetingTitle}</span>
        </p>
        <p className="flex items-center gap-1.5">
          <CalendarClock className="size-3.5 shrink-0" />
          {format(new Date(r.meetingDate), "d MMM yyyy")}
          {r.courseTitle ? ` · ${r.courseTitle}` : ""}
        </p>
      </div>

      {r.note && (
        <p className="bg-muted/50 rounded-lg px-3 py-2 text-xs italic">
          &ldquo;{r.note}&rdquo;
        </p>
      )}

      {!awaiting && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor={`price-${r.id}`} className="text-xs">
              Price (₹) — blank is free
            </Label>
            <Input
              id={`price-${r.id}`}
              inputMode="decimal"
              placeholder="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`days-${r.id}`} className="text-xs">
              Access for (days)
            </Label>
            <Input
              id={`days-${r.id}`}
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="h-8"
            />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {!awaiting && (
          <Button size="sm" className="flex-1" onClick={approve} disabled={busy !== null}>
            {busy === "approve" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {Number(price) > 0 ? "Set price & share" : "Share free"}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className={awaiting ? "flex-1" : ""}
          onClick={decline}
          disabled={busy !== null}
        >
          {busy === "decline" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <X className="size-4" />
          )}
          Decline
        </Button>
      </div>
    </Card>
  );
}

export function RecordingsClient({
  recordings,
  requests,
  batches,
}: {
  recordings: AdminRecordingRow[];
  requests: AdminRequestRow[];
  batches: BatchOption[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [courseFilter, setCourseFilter] = useState(ALL);
  const [batchFilter, setBatchFilter] = useState(ALL);
  const [sort, setSort] = useState<SortKey>("date-desc");
  const [playing, setPlaying] = useState<AdminRecordingRow | null>(null);
  const [assignTo, setAssignTo] = useState("");
  const [assigning, setAssigning] = useState(false);

  async function assign() {
    if (!playing || !assignTo) return;
    setAssigning(true);
    try {
      await api.post(`/api/recordings/${playing.id}/assign`, { batchId: assignTo });
      toast.success("Recording assigned to the batch.");
      setAssignTo("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't assign that.");
    } finally {
      setAssigning(false);
    }
  }

  const pending = requests.filter(
    (r) => r.status === "PENDING" || r.status === "AWAITING_PAYMENT",
  );

  // Filter choices come from the recordings themselves — no extra query.
  const courses = useMemo(
    () => [...new Set(recordings.map((r) => r.courseTitle).filter(Boolean))].sort() as string[],
    [recordings],
  );
  const batchNames = useMemo(
    () => [...new Set(recordings.map((r) => r.batchName).filter(Boolean))].sort() as string[],
    [recordings],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = recordings.filter((r) => {
      if (needle && !(
        r.title.toLowerCase().includes(needle) ||
        (r.courseTitle ?? "").toLowerCase().includes(needle) ||
        (r.batchName ?? "").toLowerCase().includes(needle)
      )) return false;
      if (courseFilter !== ALL && r.courseTitle !== courseFilter) return false;
      if (batchFilter !== ALL && r.batchName !== batchFilter) return false;
      return true;
    });
    const by = SORTERS[sort];
    return [...out].sort(by);
  }, [q, courseFilter, batchFilter, sort, recordings]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recordings"
        description="Every class recording — always available here — and the learner requests to share them."
      />

      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Clock className="text-primary size-4" /> Requests to review
            <Badge variant="secondary">{pending.length}</Badge>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pending.map((r) => (
              <RequestCard key={r.id} r={r} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Film className="text-muted-foreground size-4" /> All recordings
              <Badge variant="secondary">{recordings.length}</Badge>
            </h2>
            {recordings.length > 0 && (
              <a
                href="/api/recordings/zip"
                download
                className="hover:bg-accent inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
              >
                <Download className="size-4" /> Download all (zip)
              </a>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {courses.length > 0 && (
              <Select value={courseFilter} onValueChange={(v) => setCourseFilter(v ?? ALL)}>
                <SelectTrigger className="w-44">
                  <SelectValue>
                    {(v) => (!v || v === ALL ? "Every course" : (v as string))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Every course</SelectItem>
                  {courses.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {batchNames.length > 0 && (
              <Select value={batchFilter} onValueChange={(v) => setBatchFilter(v ?? ALL)}>
                <SelectTrigger className="w-40">
                  <SelectValue>
                    {(v) => (!v || v === ALL ? "Every batch" : (v as string))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Every batch</SelectItem>
                  {batchNames.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={sort} onValueChange={(v) => v && setSort(v as SortKey)}>
              <SelectTrigger className="w-40">
                <SelectValue>
                  {(v) => SORT_LABEL[(v as SortKey) || "date-desc"]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {SORT_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative min-w-48 flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                placeholder="Search recordings…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <Card className="text-muted-foreground items-center py-12 text-center text-sm">
            No recordings{q ? " match your search" : " yet"}.
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((rec) => (
              <Card key={rec.id} className="gap-0 overflow-hidden p-0">
                <button
                  type="button"
                  onClick={() => setPlaying(rec)}
                  className="group relative flex aspect-video items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900"
                >
                  <PlayCircle className="size-11 text-white/90 transition-transform group-hover:scale-110" />
                  {rec.pendingRequests > 0 && (
                    <Badge className="absolute top-2.5 right-2.5 bg-amber-500 text-[10px] text-white">
                      {rec.pendingRequests} request{rec.pendingRequests === 1 ? "" : "s"}
                    </Badge>
                  )}
                  <Badge
                    variant="secondary"
                    className="absolute top-2.5 left-2.5 gap-1 bg-black/50 text-[10px] text-white backdrop-blur"
                  >
                    {rec.published ? (
                      <>
                        <CheckCircle2 className="size-3" /> Published
                      </>
                    ) : (
                      "Unpublished"
                    )}
                  </Badge>
                </button>
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="line-clamp-2 leading-snug font-semibold">{rec.title}</h3>
                  <div className="text-muted-foreground mt-1.5 space-y-1 text-xs">
                    <p className="flex items-center gap-1.5">
                      <CalendarClock className="size-3.5 shrink-0" />
                      {format(new Date(rec.scheduledStart), "d MMM yyyy")}
                    </p>
                    {(rec.courseTitle || rec.batchName) && (
                      <p className="truncate">{rec.courseTitle ?? rec.batchName}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-4 w-full"
                    onClick={() => setPlaying(rec)}
                  >
                    <PlayCircle className="size-4" /> Play recording
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Dialog
        open={playing !== null}
        onOpenChange={(o) => {
          if (!o) {
            setPlaying(null);
            setAssignTo("");
          }
        }}
      >
        <DialogContent className="gap-3 p-4 sm:max-w-3xl sm:p-5">
          <DialogHeader className="text-left">
            <DialogTitle className="leading-snug">{playing?.title}</DialogTitle>
            <DialogDescription>
              {playing
                ? `${format(new Date(playing.scheduledStart), "d MMM yyyy")}${playing.courseTitle ? ` · ${playing.courseTitle}` : ""}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {playing && (
            <RecordingPlayer key={playing.id} meetingId={playing.id} watermarkPrice={null} />
          )}
          {playing && batches.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <span className="text-muted-foreground text-xs">
                Assign to another batch:
              </span>
              <Select value={assignTo} onValueChange={(v) => setAssignTo(v ?? "")}>
                <SelectTrigger className="h-8 w-56">
                  <SelectValue>
                    {(v) =>
                      (v && batches.find((b) => b.id === v)?.name) || "Choose a batch"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {batches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} · {b.courseTitle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={assign} disabled={!assignTo || assigning}>
                {assigning ? <Loader2 className="size-4 animate-spin" /> : "Assign"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
