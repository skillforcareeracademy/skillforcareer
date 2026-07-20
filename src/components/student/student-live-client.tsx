"use client";

import { useMemo, useState } from "react";
import { format, formatDistanceToNow, formatDistanceToNowStrict, isSameDay } from "date-fns";
import {
  Video,
  CalendarClock,
  PlayCircle,
  Clock,
  BookOpen,
  CalendarPlus,
  Radio,
  Film,
} from "lucide-react";
import type { StudentMeeting } from "@/server/services/live-service";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/shared/button-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function whenLabel(startIso: string, endIso: string | null): string {
  const start = new Date(startIso);
  const day = format(start, "EEE, d MMM");
  const from = format(start, "h:mm a");
  if (!endIso) return `${day} · ${from}`;
  const end = new Date(endIso);
  const to = format(end, "h:mm a");
  return isSameDay(start, end) ? `${day} · ${from} – ${to}` : `${day} · ${from}`;
}

/** Build and download an .ics calendar invite for a meeting. */
function addToCalendar(m: StudentMeeting) {
  const stamp = (d: Date) => `${d.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
  const start = new Date(m.scheduledStart);
  const end = m.scheduledEnd ? new Date(m.scheduledEnd) : new Date(start.getTime() + 60 * 60 * 1000);
  const url = `${window.location.origin}/live/room/${m.roomCode}`;
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SkillForCareer//Live//EN",
    "BEGIN:VEVENT",
    `UID:${m.roomCode}@skillforcareer`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(m.title)}`,
    `DESCRIPTION:${esc(`${m.description ?? ""}\nJoin: ${url}`)}`,
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `${m.roomCode}.ics`;
  a.click();
  URL.revokeObjectURL(href);
}

export function StudentLiveClient({ meetings }: { meetings: StudentMeeting[] }) {
  const { live, upcoming, past } = useMemo(() => {
    const live = meetings.filter((m) => m.phase === "live");
    const upcoming = meetings
      .filter((m) => m.phase === "upcoming")
      .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
    const past = meetings
      .filter((m) => m.phase === "past" || m.phase === "cancelled")
      .sort((a, b) => b.scheduledStart.localeCompare(a.scheduledStart));
    return { live, upcoming, past };
  }, [meetings]);

  const nextUp = upcoming[0];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Live classes"
        description="Join interactive sessions with your instructors and catch up on recordings."
        actions={
          live.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1.5 text-sm font-medium text-rose-600 dark:text-rose-400">
              <Radio className="size-4" /> {live.length} live now
            </span>
          ) : nextUp ? (
            <span className="text-muted-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm">
              <CalendarClock className="size-4" /> Next in{" "}
              {formatDistanceToNowStrict(new Date(nextUp.scheduledStart))}
            </span>
          ) : undefined
        }
      />

      {meetings.length === 0 ? (
        <EmptyState
          icon={Video}
          title="No live classes yet"
          description="When your courses schedule live sessions, they'll show up here with a one-tap join."
        />
      ) : (
        <div className="space-y-8">
          {/* Live hero(es) */}
          {live.length > 0 && (
            <div className="space-y-4">
              {live.map((m) => (
                <LiveHero key={m.id} m={m} />
              ))}
            </div>
          )}

          {/* Upcoming agenda */}
          {upcoming.length > 0 && (
            <Section icon={CalendarClock} title="Upcoming" count={upcoming.length}>
              <div className="space-y-3">
                {upcoming.map((m) => (
                  <UpcomingRow key={m.id} m={m} />
                ))}
              </div>
            </Section>
          )}

          {/* Recordings & past */}
          {past.length > 0 && (
            <Section icon={Film} title="Recordings & past classes" count={past.length}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {past.map((m) => (
                  <PastCard key={m.id} m={m} />
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: typeof Radio;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="text-muted-foreground size-4" />
        {title}
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
          {count}
        </span>
      </h2>
      {children}
    </section>
  );
}

function LiveHero({ m }: { m: StudentMeeting }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-600 via-rose-500 to-pink-600 p-6 text-white shadow-lg shadow-rose-500/25 sm:p-8">
      <div className="pointer-events-none absolute -top-16 -right-12 size-56 rounded-full bg-white/15 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-12 size-56 rounded-full bg-black/10 blur-2xl" />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold tracking-wide backdrop-blur">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-white" />
              </span>
              LIVE NOW
            </span>
            {m.courseTitle && <span className="text-sm text-white/80">{m.courseTitle}</span>}
          </div>

          <h2 className="mt-3 text-2xl leading-tight font-bold sm:text-3xl">{m.title}</h2>
          {m.description && (
            <p className="mt-2 max-w-xl text-sm text-white/85">{m.description}</p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/90">
            <span className="flex items-center gap-1.5">
              <CalendarClock className="size-4" /> {whenLabel(m.scheduledStart, m.scheduledEnd)}
            </span>
            <span className="flex items-center gap-1.5">
              <Avatar className="size-6 ring-2 ring-white/30">
                {m.hostAvatar && <AvatarImage src={m.hostAvatar} alt={m.hostName} />}
                <AvatarFallback className="bg-white/20 text-[10px] text-white">
                  {initials(m.hostName)}
                </AvatarFallback>
              </Avatar>
              {m.hostName}
            </span>
          </div>
        </div>

        <div className="shrink-0">
          <ButtonLink
            href={`/live/room/${m.roomCode}`}
            size="lg"
            className="w-full bg-white text-rose-600 shadow-md hover:bg-white/90 sm:w-auto"
          >
            <Video className="size-5" /> Join now
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

function UpcomingRow({ m }: { m: StudentMeeting }) {
  const start = new Date(m.scheduledStart);
  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
      {/* Date chip */}
      <div className="flex size-16 shrink-0 flex-col items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
        <span className="text-[10px] font-semibold tracking-wide uppercase">{format(start, "MMM")}</span>
        <span className="text-xl leading-none font-bold">{format(start, "d")}</span>
        <span className="text-[10px]">{format(start, "EEE")}</span>
      </div>

      <div className="min-w-0 flex-1">
        <Badge variant="secondary" className="gap-1">
          <Clock className="size-3" /> in {formatDistanceToNow(start)}
        </Badge>
        <h3 className="mt-1.5 leading-snug font-semibold">{m.title}</h3>
        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs">
          <span className="flex items-center gap-1">
            <CalendarClock className="size-3.5" /> {whenLabel(m.scheduledStart, m.scheduledEnd)}
          </span>
          {(m.courseTitle || m.batchName) && (
            <span className="flex items-center gap-1">
              <BookOpen className="size-3.5" /> {m.courseTitle ?? m.batchName}
            </span>
          )}
          <span>Hosted by {m.hostName}</span>
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        <Button variant="outline" size="sm" onClick={() => addToCalendar(m)}>
          <CalendarPlus className="size-4" /> Add to calendar
        </Button>
      </div>
    </Card>
  );
}

function PastCard({ m }: { m: StudentMeeting }) {
  const hasRecording = Boolean(m.recordingUrl);
  const isCancelled = m.phase === "cancelled";
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card className="gap-0 overflow-hidden p-0">
        {/* Thumbnail — click to play when a recording exists */}
        {hasRecording ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Play recording: ${m.title}`}
            className="group relative flex aspect-video items-center justify-center overflow-hidden bg-gradient-to-br from-slate-700 to-slate-900"
          >
            <span className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
            <PlayCircle className="relative size-12 text-white/90 transition-transform group-hover:scale-110" />
            <Badge
              variant="secondary"
              className="absolute top-2.5 left-2.5 bg-black/50 text-[10px] text-white backdrop-blur"
            >
              Recording
            </Badge>
          </button>
        ) : (
          <div className="bg-muted relative flex aspect-video items-center justify-center">
            <Film className="text-muted-foreground/50 size-10" />
            <Badge
              variant="secondary"
              className="absolute top-2.5 left-2.5 bg-black/50 text-[10px] text-white backdrop-blur"
            >
              {isCancelled ? "Cancelled" : "Ended"}
            </Badge>
          </div>
        )}

        <div className="flex flex-1 flex-col p-4">
          <h3 className="line-clamp-2 leading-snug font-semibold">{m.title}</h3>
          <div className="text-muted-foreground mt-1.5 space-y-1 text-xs">
            <p className="flex items-center gap-1.5">
              <CalendarClock className="size-3.5" /> {format(new Date(m.scheduledStart), "d MMM yyyy")}
            </p>
            {(m.courseTitle || m.batchName) && (
              <p className="flex items-center gap-1.5">
                <BookOpen className="size-3.5" />
                <span className="truncate">{m.courseTitle ?? m.batchName}</span>
              </p>
            )}
          </div>

          <div className="mt-4">
            {hasRecording ? (
              <Button size="sm" variant="outline" className="w-full" onClick={() => setOpen(true)}>
                <PlayCircle className="size-4" /> Watch recording
              </Button>
            ) : (
              <p className="text-muted-foreground text-center text-xs">
                {isCancelled ? "This class was cancelled" : "No recording available"}
              </p>
            )}
          </div>
        </div>
      </Card>

      {hasRecording && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="gap-3 p-4 sm:max-w-3xl sm:p-5">
            <DialogHeader className="text-left">
              <DialogTitle className="leading-snug">{m.title}</DialogTitle>
              <DialogDescription>
                {format(new Date(m.scheduledStart), "d MMM yyyy")}
                {m.courseTitle ? ` · ${m.courseTitle}` : ""}
              </DialogDescription>
            </DialogHeader>
            {/* Only mount the player while open so it loads on demand and stops on close. */}
            {open && (
              <video
                key={m.id}
                src={m.recordingUrl!}
                controls
                autoPlay
                playsInline
                controlsList="nodownload"
                className="aspect-video w-full rounded-lg bg-black"
              >
                <track kind="captions" />
              </video>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
