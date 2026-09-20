"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
  XCircle,
} from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import {
  formatIst,
  formatIstTime,
  istDateKey,
  istTimeOfDay,
  istToday,
} from "@/lib/ist";
import type { BatchClassRow, BatchClassesView } from "@/server/services/class-schedule-service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * A batch's classes: the timetable the batch's days and time produced, plus
 * any extra classes added by hand, with completed-vs-pending counts.
 *
 * With `canManage`, the teaching team can add a class, rebuild the timetable,
 * and reschedule, cancel, start, end or reinstate any class — every one of
 * which emails the batch's learners and instructors straight away. A class
 * changed here is marked as overridden, so rebuilding the timetable leaves it
 * alone.
 *
 * All times are shown and entered in IST, the academy's time, whatever time
 * zone the viewer's device is set to.
 */

const UPCOMING_PREVIEW = 8;
const PAST_PREVIEW = 5;

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Scheduled",
  LIVE: "Live",
  ENDED: "Ended",
  CANCELLED: "Cancelled",
};

const STATUS_TONE: Record<string, string> = {
  SCHEDULED: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  LIVE: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
  ENDED: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  CANCELLED: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
};

function scheduleLabel(s: BatchClassesView["batch"]["schedule"]): string | null {
  if (!s) return null;
  const toAmPm = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    const suffix = h >= 12 ? "pm" : "am";
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
  };
  const time = s.endTime ? `${toAmPm(s.startTime)} – ${toAmPm(s.endTime)}` : toAmPm(s.startTime);
  return `${s.days.join(", ")} · ${time} IST`;
}

function slotLabel(c: BatchClassRow): string {
  const day = formatIst(c.scheduledStart, { weekday: "short", day: "numeric", month: "short" });
  const end = c.scheduledEnd ? ` – ${formatIstTime(c.scheduledEnd)}` : "";
  return `${day} · ${formatIstTime(c.scheduledStart)}${end}`;
}

export function BatchClassesPanel({
  batchId,
  canManage,
}: {
  batchId: string;
  canManage: boolean;
}) {
  const [data, setData] = useState<BatchClassesView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);

  const [adding, setAdding] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [rescheduling, setRescheduling] = useState<BatchClassRow | null>(null);
  const [cancelling, setCancelling] = useState<BatchClassRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  /** Re-read after an action. Called from handlers, not effects. */
  const reload = useCallback(async () => {
    try {
      setData(await api.get<BatchClassesView>(`/api/batches/${batchId}/classes`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load classes.");
    }
  }, [batchId]);

  useEffect(() => {
    let alive = true;
    api
      .get<BatchClassesView>(`/api/batches/${batchId}/classes`)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((err) => alive && setError(err instanceof ApiError ? err.message : "Couldn't load classes."));
    return () => {
      alive = false;
    };
  }, [batchId]);

  const { ahead, behind } = useMemo(() => {
    const list = data?.classes ?? [];
    return {
      ahead: list.filter((c) => c.phase === "upcoming" || c.phase === "live"),
      behind: list.filter((c) => c.phase === "past" || c.phase === "cancelled"),
    };
  }, [data]);

  async function setStatus(c: BatchClassRow, status: "LIVE" | "ENDED" | "SCHEDULED", openRoom = false) {
    setBusyId(c.id);
    try {
      const res = await api.post<{ notified: number }>(`/api/meetings/${c.id}/status`, { status });
      const who = res.notified ? ` · ${res.notified} learner${res.notified === 1 ? "" : "s"} notified` : "";
      toast.success(
        status === "LIVE" ? `Class started${who}.` : status === "ENDED" ? `Class ended${who}.` : `Class reinstated${who}.`,
      );
      if (openRoom) window.open(`/live/room/${c.roomCode}`, "_blank", "noopener");
      await reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update the class.");
    } finally {
      setBusyId(null);
    }
  }

  if (error && !data) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-10 text-center text-sm">{error}</CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="space-y-3 py-5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </CardContent>
      </Card>
    );
  }

  const { stats } = data;
  const donePct = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;
  const shownAhead = showAllUpcoming ? ahead : ahead.slice(0, UPCOMING_PREVIEW);
  const shownBehind = showAllPast ? behind : behind.slice(0, PAST_PREVIEW);
  const timetable = scheduleLabel(data.batch.schedule);

  return (
    <Card>
      <CardContent className="space-y-5 py-5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 font-semibold">
              <CalendarClock className="text-muted-foreground size-4" /> Classes
              {stats.live > 0 && (
                <Badge variant="secondary" className={STATUS_TONE.LIVE}>
                  <Circle className="size-2 animate-pulse fill-current" /> {stats.live} live
                </Badge>
              )}
            </h3>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {timetable ?? "No days and time set on this batch yet — add them to get an automatic timetable."}
            </p>
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setRebuilding(true)}>
                <RefreshCw className="size-3.5" /> Rebuild timetable
              </Button>
              <Button size="sm" onClick={() => setAdding(true)}>
                <CalendarPlus className="size-3.5" /> Add class
              </Button>
            </div>
          )}
        </div>

        {/* Completed vs pending */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Total" value={stats.total} />
            <Stat label="Completed" value={stats.completed} tone="text-emerald-600 dark:text-emerald-400" />
            <Stat label="Pending" value={stats.pending} tone="text-sky-600 dark:text-sky-400" />
            <Stat label="Cancelled" value={stats.cancelled} tone="text-zinc-500" />
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full" aria-hidden>
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${donePct}%` }} />
            </div>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {stats.completed} of {stats.total} done
            </span>
          </div>
        </div>

        {/* Upcoming */}
        <Section title="Upcoming" count={ahead.length}>
          {ahead.length === 0 ? (
            <p className="text-muted-foreground py-3 text-sm">Nothing scheduled.</p>
          ) : (
            shownAhead.map((c) => (
              <ClassRow
                key={c.id}
                c={c}
                canManage={canManage}
                busy={busyId === c.id}
                onStart={() => setStatus(c, "LIVE", true)}
                onEnd={() => setStatus(c, "ENDED")}
                onReinstate={() => setStatus(c, "SCHEDULED")}
                onReschedule={() => setRescheduling(c)}
                onCancel={() => setCancelling(c)}
              />
            ))
          )}
          {ahead.length > UPCOMING_PREVIEW && (
            <Button variant="ghost" size="sm" onClick={() => setShowAllUpcoming((v) => !v)}>
              {showAllUpcoming ? "Show fewer" : `Show all ${ahead.length}`}
            </Button>
          )}
        </Section>

        {/* Past + cancelled */}
        {behind.length > 0 && (
          <Section title="Past & cancelled" count={behind.length}>
            {shownBehind.map((c) => (
              <ClassRow
                key={c.id}
                c={c}
                canManage={canManage}
                busy={busyId === c.id}
                onStart={() => setStatus(c, "LIVE", true)}
                onEnd={() => setStatus(c, "ENDED")}
                onReinstate={() => setStatus(c, "SCHEDULED")}
                onReschedule={() => setRescheduling(c)}
                onCancel={() => setCancelling(c)}
              />
            ))}
            {behind.length > PAST_PREVIEW && (
              <Button variant="ghost" size="sm" onClick={() => setShowAllPast((v) => !v)}>
                {showAllPast ? "Show fewer" : `Show all ${behind.length}`}
              </Button>
            )}
          </Section>
        )}
      </CardContent>

      {canManage && (
        <>
          <AddClassDialog
            open={adding}
            onOpenChange={setAdding}
            batchId={batchId}
            onDone={reload}
          />
          <RebuildDialog
            open={rebuilding}
            onOpenChange={setRebuilding}
            batchId={batchId}
            onDone={reload}
          />
          <RescheduleDialog target={rescheduling} onClose={() => setRescheduling(null)} onDone={reload} />
          <CancelDialog target={cancelling} onClose={() => setCancelling(null)} onDone={reload} />
        </>
      )}
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="bg-muted/50 rounded-lg px-3 py-2">
      <p className={cn("text-xl leading-none font-semibold tabular-nums", tone)}>{value}</p>
      <p className="text-muted-foreground mt-1 text-xs">{label}</p>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
        {title}
        <span className="bg-muted rounded-full px-1.5 py-0.5 text-[10px] font-medium">{count}</span>
      </h4>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function ClassRow({
  c,
  canManage,
  busy,
  onStart,
  onEnd,
  onReinstate,
  onReschedule,
  onCancel,
}: {
  c: BatchClassRow;
  canManage: boolean;
  busy: boolean;
  onStart: () => void;
  onEnd: () => void;
  onReinstate: () => void;
  onReschedule: () => void;
  onCancel: () => void;
}) {
  const online = c.provider !== "offline";
  const started = c.started;
  const future = !started;
  const canStart = online && c.status === "SCHEDULED";
  const canEnd = c.status === "LIVE" || (c.status === "SCHEDULED" && started);
  const canReschedule = c.status === "SCHEDULED" || c.status === "CANCELLED";
  const canCancel = c.status === "SCHEDULED";
  const canReinstate = c.status === "CANCELLED" && future;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3",
        c.phase === "cancelled" && "opacity-70",
        c.phase === "live" && "border-rose-500/40 bg-rose-500/5",
      )}
    >
      <div className="bg-muted flex size-12 shrink-0 flex-col items-center justify-center rounded-lg">
        <span className="text-[10px] font-semibold uppercase">
          {formatIst(c.scheduledStart, { month: "short" })}
        </span>
        <span className="text-lg leading-none font-bold">{formatIst(c.scheduledStart, { day: "numeric" })}</span>
      </div>

      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium", c.phase === "cancelled" && "line-through")}>{c.title}</p>
        <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
          <Clock className="size-3 shrink-0" /> {slotLabel(c)} IST · {c.hostName}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Badge variant="secondary" className={STATUS_TONE[c.status]}>
            {c.status === "LIVE" && <Circle className="size-2 animate-pulse fill-current" />}
            {STATUS_LABEL[c.status] ?? c.status}
          </Badge>
          {c.autoScheduled ? (
            <Badge variant="outline">{c.manualOverride ? "Timetable · changed by hand" : "Timetable"}</Badge>
          ) : (
            <Badge variant="outline">Added by hand</Badge>
          )}
          {!online && <Badge variant="outline">In person</Badge>}
          {c.reminderSent && c.status === "SCHEDULED" && <Badge variant="outline">Reminder sent</Badge>}
        </div>
        {c.cancelReason && c.status === "CANCELLED" && (
          <p className="text-muted-foreground mt-1 text-xs">Reason: {c.cancelReason}</p>
        )}
      </div>

      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" disabled={busy} />}
            aria-label={`Actions for ${c.title}`}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canStart && (
              <DropdownMenuItem onClick={onStart}>
                <Play className="size-4" /> Start class
              </DropdownMenuItem>
            )}
            {online && c.status !== "CANCELLED" && c.status !== "ENDED" && (
              <DropdownMenuItem onClick={() => window.open(`/live/room/${c.roomCode}`, "_blank", "noopener")}>
                <ExternalLink className="size-4" /> Open room
              </DropdownMenuItem>
            )}
            {canReschedule && (
              <DropdownMenuItem onClick={onReschedule}>
                <CalendarClock className="size-4" /> Reschedule
              </DropdownMenuItem>
            )}
            {canEnd && (
              <DropdownMenuItem onClick={onEnd}>
                <Square className="size-4" /> End class
              </DropdownMenuItem>
            )}
            {canReinstate && (
              <DropdownMenuItem onClick={onReinstate}>
                <RotateCcw className="size-4" /> Reinstate
              </DropdownMenuItem>
            )}
            {canCancel && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onCancel} className="text-destructive">
                  <XCircle className="size-4" /> Cancel class
                </DropdownMenuItem>
              </>
            )}
            {!canStart && !canReschedule && !canEnd && !canReinstate && !canCancel && (
              <DropdownMenuItem disabled>
                <CheckCircle2 className="size-4" /> Nothing to change
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// ── Dialogs ─────────────────────────────────────────────────────────────────

function AddClassDialog({
  open,
  onOpenChange,
  batchId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string;
  onDone: () => Promise<void>;
}) {
  const [form, setForm] = useState({ title: "", date: "", startTime: "", endTime: "", description: "" });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post<{ notified: number }>(`/api/batches/${batchId}/classes`, form);
      toast.success(
        res.notified ? `Class added — ${res.notified} learner${res.notified === 1 ? "" : "s"} notified.` : "Class added.",
      );
      setForm({ title: "", date: "", startTime: "", endTime: "", description: "" });
      onOpenChange(false);
      await onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't add the class.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a class</DialogTitle>
          <DialogDescription>
            An extra class outside the timetable — a make-up or doubt session, or a class on a holiday.
            Learners and instructors are emailed straight away.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bc-title">Title (optional)</Label>
            <Input
              id="bc-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Doubt-clearing session"
              maxLength={150}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="col-span-2 space-y-1.5 sm:col-span-1">
              <Label htmlFor="bc-date">Date</Label>
              <Input
                id="bc-date"
                type="date"
                min={istToday()}
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bc-start">Starts (IST)</Label>
              <Input
                id="bc-start"
                type="time"
                value={form.startTime}
                onChange={(e) => set("startTime", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bc-end">Ends (IST)</Label>
              <Input id="bc-end" type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bc-desc">Note for learners (optional)</Label>
            <Textarea
              id="bc-desc"
              rows={2}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              maxLength={2000}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !form.date || !form.startTime}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Add &amp; notify
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RebuildDialog({
  open,
  onOpenChange,
  batchId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string;
  onDone: () => Promise<void>;
}) {
  const [working, setWorking] = useState(false);

  async function rebuild() {
    setWorking(true);
    try {
      const res = await api.post<{ message: string }>(`/api/batches/${batchId}/classes/sync`);
      toast.success(res.message);
      onOpenChange(false);
      await onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't rebuild the timetable.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Rebuild the timetable?</AlertDialogTitle>
          <AlertDialogDescription>
            Upcoming classes are re-created from the batch&apos;s days, time and dates, skipping
            holidays. Classes you changed by hand, extra classes, and anything that has already
            happened stay exactly as they are. If anything changes, learners get one email with the
            new timetable.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={rebuild} disabled={working}>
            {working && <Loader2 className="size-4 animate-spin" />}
            Rebuild
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RescheduleDialog({
  target,
  onClose,
  onDone,
}: {
  target: BatchClassRow | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  return (
    <Dialog open={target != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {target && <RescheduleForm key={target.id} target={target} onClose={onClose} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  );
}

function RescheduleForm({
  target,
  onClose,
  onDone,
}: {
  target: BatchClassRow;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const start = new Date(target.scheduledStart);
  const [form, setForm] = useState({
    date: istDateKey(start),
    startTime: istTimeOfDay(start),
    endTime: target.scheduledEnd ? istTimeOfDay(new Date(target.scheduledEnd)) : "",
    reason: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Bare date + time: the server reads it as IST.
      const res = await api.post<{ notified: number }>(`/api/meetings/${target.id}/reschedule`, {
        scheduledStart: `${form.date}T${form.startTime}`,
        scheduledEnd: form.endTime ? `${form.date}T${form.endTime}` : "",
        reason: form.reason,
      });
      toast.success(
        res.notified ? `Rescheduled — ${res.notified} learner${res.notified === 1 ? "" : "s"} notified.` : "Rescheduled.",
      );
      onClose();
      await onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't reschedule.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Reschedule class</DialogTitle>
        <DialogDescription>
          Move &ldquo;{target.title}&rdquo;. Learners and instructors are emailed straight away, and
          rebuilding the timetable won&apos;t move it back.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="col-span-2 space-y-1.5 sm:col-span-1">
            <Label htmlFor="rs-date">Date</Label>
            <Input
              id="rs-date"
              type="date"
              min={istToday()}
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rs-start">Starts (IST)</Label>
            <Input id="rs-start" type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rs-end">Ends (IST)</Label>
            <Input id="rs-end" type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rs-reason">Reason (optional)</Label>
          <Textarea
            id="rs-reason"
            rows={2}
            maxLength={300}
            value={form.reason}
            onChange={(e) => set("reason", e.target.value)}
            placeholder="e.g. Instructor unavailable — moved to Friday."
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !form.date || !form.startTime}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Reschedule &amp; notify
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function CancelDialog({
  target,
  onClose,
  onDone,
}: {
  target: BatchClassRow | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    setSaving(true);
    try {
      const res = await api.post<{ notified: number }>(`/api/meetings/${target.id}/status`, {
        status: "CANCELLED",
        reason,
      });
      toast.success(
        res.notified ? `Class cancelled — ${res.notified} learner${res.notified === 1 ? "" : "s"} notified.` : "Class cancelled.",
      );
      setReason("");
      onClose();
      await onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't cancel the class.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={target != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel class</DialogTitle>
          <DialogDescription>
            {target ? `“${target.title}” on ${slotLabel(target)} IST. ` : ""}
            Learners and instructors are emailed with your reason.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cc-reason">Reason</Label>
            <Textarea
              id="cc-reason"
              rows={3}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Instructor unwell — a make-up class will be scheduled."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Keep class
            </Button>
            <Button type="submit" variant="destructive" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Cancel &amp; notify
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
