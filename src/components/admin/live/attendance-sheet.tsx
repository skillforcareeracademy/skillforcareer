"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { Loader2, MapPin, CalendarClock, CheckCheck, Clock, Save } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { ATTENDANCE_STATUSES, ATTENDANCE_STATUS_LABEL } from "@/lib/validations/live";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Learner {
  userId: string;
  name: string;
  avatar: string | null;
  status: string;
  joinedAt: string | null;
  leftAt: string | null;
  attendedMinutes: number;
  attendedPercent: number | null;
  marked: boolean;
}
interface Roster {
  id: string;
  title: string;
  location: string | null;
  scheduledStart: string;
  classMinutes: number | null;
  learners: Learner[];
}

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

const STATUS_STYLE: Record<string, string> = {
  PRESENT: "bg-emerald-600 text-white",
  ABSENT: "bg-muted text-muted-foreground",
  LATE: "bg-amber-500 text-white",
  LEFT_EARLY: "bg-sky-600 text-white",
};

export function AttendanceSheet({
  meetingId,
  onOpenChange,
}: {
  meetingId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={meetingId != null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {meetingId && <Body meetingId={meetingId} onClosed={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function Body({ meetingId, onClosed }: { meetingId: string; onClosed: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<Roster | null>(null);
  const [error, setError] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  /** Minutes as typed. Only what staff actually touch is sent. */
  const [minutes, setMinutes] = useState<Record<string, string>>({});
  const [edited, setEdited] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get<Roster>(`/api/meetings/${meetingId}/attendance`)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setStatuses(Object.fromEntries(d.learners.map((l) => [l.userId, l.status])));
        setMinutes(
          Object.fromEntries(
            d.learners.map((l) => [l.userId, l.attendedMinutes ? String(l.attendedMinutes) : ""]),
          ),
        );
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [meetingId]);

  function setStatus(userId: string, status: string) {
    setStatuses((s) => ({ ...s, [userId]: status }));
  }
  function setMinutesFor(userId: string, value: string) {
    setMinutes((m) => ({ ...m, [userId]: value.replace(/[^0-9]/g, "") }));
    setEdited((e) => new Set(e).add(userId));
  }
  function markAllPresent() {
    if (!data) return;
    setStatuses(Object.fromEntries(data.learners.map((l) => [l.userId, "PRESENT"])));
  }
  /** Everyone gets credited the whole class — the common correction. */
  function fillFullClass() {
    if (!data?.classMinutes) return;
    const full = String(data.classMinutes);
    setMinutes(Object.fromEntries(data.learners.map((l) => [l.userId, full])));
    setEdited(new Set(data.learners.map((l) => l.userId)));
  }

  async function save() {
    if (!data) return;
    setSaving(true);
    try {
      const res = await api.post<{ count: number }>(`/api/meetings/${meetingId}/attendance`, {
        records: data.learners.map((l) => ({
          userId: l.userId,
          status: statuses[l.userId] ?? "ABSENT",
          // Untouched rows leave whatever the room recorded alone.
          ...(edited.has(l.userId)
            ? { minutes: Number(minutes[l.userId] || 0) }
            : {}),
        })),
      });
      toast.success(`Attendance saved for ${res.count} learner${res.count === 1 ? "" : "s"}.`);
      router.refresh();
      onClosed();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save attendance.");
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <div className="p-6">
        <SheetHeader className="p-0">
          <SheetTitle>Attendance</SheetTitle>
          <SheetDescription>Couldn&apos;t load the roster.</SheetDescription>
        </SheetHeader>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  const presentCount = data.learners.filter((l) => (statuses[l.userId] ?? "ABSENT") === "PRESENT").length;

  return (
    <div className="flex flex-col">
      <SheetHeader className="border-b p-6 pb-4">
        <SheetTitle className="leading-snug">{data.title}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5">
            <CalendarClock className="size-3.5" /> {format(new Date(data.scheduledStart), "d MMM, h:mm a")}
          </span>
          {data.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5" /> {data.location}
            </span>
          )}
          {data.classMinutes != null && (
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" /> {data.classMinutes} min class
            </span>
          )}
        </SheetDescription>
      </SheetHeader>

      <div className="flex items-center justify-between gap-2 border-b px-6 py-3">
        <p className="text-muted-foreground text-sm">
          {presentCount} / {data.learners.length} present
        </p>
        <div className="flex gap-2">
          {data.classMinutes != null && (
            <Button variant="outline" size="sm" onClick={fillFullClass}>
              <Clock className="size-4" /> Credit full class
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={markAllPresent}>
            <CheckCheck className="size-4" /> Mark all present
          </Button>
        </div>
      </div>

      <div className="divide-y p-6 pt-2">
        {data.learners.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Nobody on this class yet — add students to it, or link it to a course
            or batch to pull in the learners enrolled there.
          </p>
        ) : (
          data.learners.map((l) => (
            <div key={l.userId} className="space-y-2 py-3">
              <div className="flex items-center gap-3">
              <Avatar className="size-9 shrink-0">
                {l.avatar && <AvatarImage src={l.avatar} alt={l.name} />}
                <AvatarFallback className="text-xs">{initials(l.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.name}</p>
                {/* What the room itself saw, before anyone corrected it. */}
                <p className="text-muted-foreground truncate text-xs">
                  {l.joinedAt
                    ? `Joined ${format(new Date(l.joinedAt), "h:mm a")}${
                        l.leftAt ? ` · left ${format(new Date(l.leftAt), "h:mm a")}` : ""
                      }`
                    : l.marked
                      ? "Marked by hand"
                      : "Register not taken"}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {ATTENDANCE_STATUSES.map((s) => {
                  const active = (statuses[l.userId] ?? "ABSENT") === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(l.userId, s)}
                      className={cn(
                        "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                        active ? STATUS_STYLE[s] : "bg-muted/60 text-muted-foreground hover:bg-muted",
                      )}
                      title={ATTENDANCE_STATUS_LABEL[s]}
                    >
                      {s === "LEFT_EARLY" ? "Left" : ATTENDANCE_STATUS_LABEL[s]}
                    </button>
                  );
                })}
              </div>
              </div>
              <div className="flex items-center gap-2 pl-12">
                <Label htmlFor={`min-${l.userId}`} className="text-muted-foreground text-xs">
                  Attended
                </Label>
                <Input
                  id={`min-${l.userId}`}
                  inputMode="numeric"
                  className="h-8 w-20 text-sm"
                  value={minutes[l.userId] ?? ""}
                  placeholder="0"
                  onChange={(e) => setMinutesFor(l.userId, e.target.value)}
                />
                <span className="text-muted-foreground text-xs">
                  min
                  {data.classMinutes != null && (
                    <> of {data.classMinutes} ·{" "}
                      {Math.min(
                        100,
                        Math.round(
                          ((Number(minutes[l.userId] || 0) || 0) / data.classMinutes) * 100,
                        ),
                      )}
                      %
                    </>
                  )}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {data.learners.length > 0 && (
        <div className="bg-popover sticky bottom-0 border-t p-4">
          <Button className="w-full" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save attendance
          </Button>
        </div>
      )}
    </div>
  );
}
