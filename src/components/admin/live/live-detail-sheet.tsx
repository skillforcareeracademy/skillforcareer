"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  BookOpen,
  Layers,
  Clock,
  Users,
  Video,
  Copy,
  Circle,
  Check,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { MEETING_STATUS_LABEL } from "@/lib/validations/live";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Participant {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
}
interface Detail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  roomCode: string;
  provider: string;
  scheduledStart: string;
  scheduledEnd: string | null;
  maxParticipants: number | null;
  isRecordingEnabled: boolean;
  recordingUrl: string | null;
  course: { title: string; slug: string } | null;
  batch: { name: string; enrolledCount: number } | null;
  host: { name: string; avatarUrl: string | null; headline: string | null };
  participants: Participant[];
}

const STATUS_BADGE: Record<string, string> = {
  SCHEDULED: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  LIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  ENDED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function LiveDetailSheet({
  meetingId,
  onOpenChange,
}: {
  meetingId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={meetingId != null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {meetingId && <DetailBody key={meetingId} meetingId={meetingId} />}
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({ meetingId }: { meetingId: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [now, setNow] = useState(0);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    const loadedAt = Date.now();
    api
      .get<Detail>(`/api/meetings/${meetingId}`)
      .then((d) => {
        if (alive) {
          setData(d);
          setNow(loadedAt);
        }
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [meetingId]);

  if (error) {
    return (
      <div className="p-6">
        <SheetHeader className="p-0">
          <SheetTitle>Live class</SheetTitle>
          <SheetDescription>Couldn&apos;t load this live class.</SheetDescription>
        </SheetHeader>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  const start = new Date(data.scheduledStart).getTime();
  const end = data.scheduledEnd ? new Date(data.scheduledEnd).getTime() : null;
  const durationMin = end ? Math.round((end - start) / 60000) : null;
  const MIN = 60000;
  let countdown = "";
  if (data.status === "LIVE") countdown = "Live now";
  else if (data.status === "ENDED") countdown = "Ended";
  else if (data.status === "CANCELLED") countdown = "Cancelled";
  else if (now && start > now) {
    const mins = Math.round((start - now) / MIN);
    countdown =
      mins < 60
        ? `Starts in ${mins} min`
        : mins < 1440
          ? `Starts in ${Math.round(mins / 60)} h`
          : `Starts in ${Math.round(mins / 1440)} days`;
  } else if (now) countdown = "Starting soon";

  const joinLink =
    typeof window !== "undefined" ? `${window.location.origin}/live/room/${data.roomCode}` : "";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(joinLink);
      setCopied(true);
      toast.success("Join link copied.");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy.");
    }
  }

  const fmt = (iso: string) => format(new Date(iso), "EEE, d MMM · h:mm a");

  return (
    <div className="flex flex-col">
      <SheetHeader className="border-b p-6 pb-4">
        <div className="flex items-start justify-between gap-3 pr-8">
          <SheetTitle className="text-xl leading-snug">{data.title}</SheetTitle>
          <Badge variant="secondary" className={cn("shrink-0 gap-1", STATUS_BADGE[data.status])}>
            {data.status === "LIVE" && <Circle className="size-2 animate-pulse fill-current" />}
            {MEETING_STATUS_LABEL[data.status] ?? data.status}
          </Badge>
        </div>
        {data.description && (
          <SheetDescription className="line-clamp-2">{data.description}</SheetDescription>
        )}
      </SheetHeader>

      <div className="space-y-6 p-6">
        {/* Host + context */}
        <div className="grid gap-3">
          <div className="flex items-center gap-3">
            <Avatar className="size-9">
              {data.host.avatarUrl && <AvatarImage src={data.host.avatarUrl} alt={data.host.name} />}
              <AvatarFallback className="bg-gradient-to-br from-rose-500 to-pink-600 text-xs text-white">
                {initials(data.host.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">Host</p>
              <p className="truncate text-sm font-medium">{data.host.name}</p>
            </div>
          </div>
          {data.course && (
            <div className="flex items-center gap-3">
              <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
                <BookOpen className="size-4 text-rose-500" />
              </span>
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs">Course</p>
                <p className="truncate text-sm font-medium">{data.course.title}</p>
              </div>
            </div>
          )}
          {data.batch && (
            <div className="flex items-center gap-3">
              <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
                <Layers className="size-4 text-violet-500" />
              </span>
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs">Batch</p>
                <p className="truncate text-sm font-medium">{data.batch.name}</p>
              </div>
            </div>
          )}
        </div>

        {/* Timing */}
        <section className="rounded-xl border p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Clock className="size-4 text-muted-foreground" /> When
          </div>
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Starts</p>
              <p className="font-medium">{fmt(data.scheduledStart)}</p>
            </div>
            {data.scheduledEnd && (
              <div className="text-right">
                <p className="text-muted-foreground text-xs">Ends</p>
                <p className="font-medium">{fmt(data.scheduledEnd)}</p>
              </div>
            )}
          </div>
          <p className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
            <span>{countdown}</span>
            {durationMin ? <span>{durationMin} min</span> : null}
          </p>
        </section>

        {/* Room / join */}
        <section className="rounded-xl border p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Video className="size-4 text-muted-foreground" /> Room
          </div>
          <div className="flex items-center gap-2">
            <code className="bg-muted flex-1 truncate rounded-md px-2.5 py-1.5 font-mono text-sm">
              {data.roomCode}
            </code>
            <Button type="button" variant="outline" size="sm" onClick={copyLink}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>Provider: {data.provider}</span>
            <span>Recording: {data.isRecordingEnabled ? "On" : "Off"}</span>
            {data.maxParticipants ? <span>Max: {data.maxParticipants}</span> : null}
          </div>
        </section>

        {/* Participants */}
        <section>
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Users className="size-4 text-muted-foreground" />
            Participants
            <span className="text-muted-foreground font-normal">({data.participants.length})</span>
          </div>
          {data.participants.length === 0 ? (
            <div className="rounded-xl border border-dashed py-8 text-center">
              <Users className="text-muted-foreground mx-auto mb-2 size-6" />
              <p className="text-sm font-medium">No participants yet</p>
              <p className="text-muted-foreground mx-auto mt-1 max-w-xs text-xs">
                {data.batch
                  ? `${data.batch.enrolledCount} learners from the linked batch are expected.`
                  : "People who join the room will appear here."}
              </p>
            </div>
          ) : (
            <ul className="divide-y rounded-xl border">
              {data.participants.map((p) => (
                <li key={p.id} className="flex items-center gap-3 p-3">
                  <Avatar className="size-9">
                    {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt={p.name} />}
                    <AvatarFallback className="text-xs">{initials(p.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-muted-foreground truncate text-xs">{p.email}</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {p.role}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
