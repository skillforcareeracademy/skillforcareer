"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  Presentation,
  Radio,
  Users,
  Video,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/shared/button-link";
import type { StudentWebinar } from "@/server/services/webinar-service";
import { cn } from "@/lib/utils";

/**
 * The learner's webinar tab — "enrolled webinar, all webinar, upcoming webinar,
 * ongoing webinar, past webinar", exactly the five views the client listed.
 *
 * Filtering is in the browser because the whole published list is at most a
 * page of rows and the tabs are meant to feel instant.
 */
const TABS = [
  { key: "REGISTERED", label: "My webinars" },
  { key: "UPCOMING", label: "Upcoming" },
  { key: "LIVE", label: "Live now" },
  { key: "PAST", label: "Past" },
  { key: "ALL", label: "All" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function StudentWebinarsClient({ webinars }: { webinars: StudentWebinar[] }) {
  const [tab, setTab] = useState<TabKey>("REGISTERED");

  const counts = useMemo(
    () => ({
      REGISTERED: webinars.filter((w) => w.registered).length,
      UPCOMING: webinars.filter((w) => w.phase === "UPCOMING").length,
      LIVE: webinars.filter((w) => w.phase === "LIVE").length,
      PAST: webinars.filter((w) => w.phase === "PAST").length,
      ALL: webinars.length,
    }),
    [webinars],
  );

  const shown = useMemo(() => {
    const list =
      tab === "REGISTERED"
        ? webinars.filter((w) => w.registered)
        : tab === "ALL"
          ? webinars
          : webinars.filter((w) => w.phase === tab);
    // Upcoming reads best soonest-first; anything finished reads best newest-first.
    return [...list].sort((a, b) =>
      tab === "PAST"
        ? b.scheduledStart.localeCompare(a.scheduledStart)
        : a.scheduledStart.localeCompare(b.scheduledStart),
    );
  }, [webinars, tab]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webinars & masterclasses"
        description="Free live sessions with industry experts — register, join and revisit."
      />

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              tab === t.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:border-primary/50 hover:text-primary",
            )}
          >
            {t.label}
            <span className="ml-1.5 opacity-70">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={Presentation}
          title={
            tab === "REGISTERED"
              ? "You haven't registered for a webinar yet"
              : tab === "LIVE"
                ? "Nothing is running right now"
                : "No webinars here"
          }
          description={
            tab === "REGISTERED"
              ? "Browse the upcoming sessions and grab a seat — they're free."
              : "New masterclasses are added regularly. Check back soon."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((w) => (
            <WebinarCard key={w.id} webinar={w} />
          ))}
        </div>
      )}
    </div>
  );
}

function WebinarCard({ webinar: w }: { webinar: StudentWebinar }) {
  const start = new Date(w.scheduledStart);
  const isPast = w.phase === "PAST";

  return (
    <Card
      className={cn(
        "flex h-full flex-col gap-0 overflow-hidden p-0 transition-shadow hover:shadow-md",
        // A finished session goes grey — "date jaane ke baad grey color ho
        // jaana chahiye".
        isPast && "opacity-70 grayscale",
      )}
    >
      <Link href={`/webinars/${w.slug}`} className="group block">
        <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-violet-500 to-fuchsia-600">
          {w.coverImageUrl ? (
            // Not next/image: covers come from arbitrary hosts.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={w.coverImageUrl}
              alt={w.title}
              className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-white/90">
              <Presentation className="size-10" aria-hidden />
            </div>
          )}

          {w.phase === "LIVE" && (
            <Badge className="absolute top-3 left-3 gap-1.5 bg-rose-600 text-white">
              <Radio className="size-3 animate-pulse" /> Live now
            </Badge>
          )}
          {isPast && (
            <Badge className="absolute top-3 left-3 bg-black/50 text-white backdrop-blur-sm">
              Ended
            </Badge>
          )}
          {w.registered && (
            <Badge className="absolute top-3 right-3 gap-1 bg-emerald-600 text-white">
              <CheckCircle2 className="size-3" /> Registered
            </Badge>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <Link href={`/webinars/${w.slug}`}>
          <h3 className="hover:text-primary line-clamp-2 leading-snug font-semibold transition-colors">
            {w.title}
          </h3>
        </Link>
        <p className="text-muted-foreground mt-1 text-xs">by {w.hostName}</p>

        <div className="text-muted-foreground mt-3 space-y-1.5 text-xs">
          <p className="flex items-center gap-1.5">
            <CalendarClock className="size-3.5" />
            {format(start, "d MMM yyyy, h:mm a")}
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" /> {w.durationMinutes} min
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="size-3.5" /> {w.registrations} registered
            </span>
          </p>
          {w.phase === "UPCOMING" && (
            <p className="text-primary font-medium">
              Starts in {formatDistanceToNowStrict(start)}
            </p>
          )}
          {isPast && w.registered && (
            <p>
              {w.attendedFully
                ? "You attended the full session"
                : w.attendedSeconds > 0
                  ? `You watched ${Math.round(w.attendedSeconds / 60)} min`
                  : "You didn't attend"}
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2 border-t pt-4">
          {w.phase === "LIVE" && w.registered && (w.roomCode || w.joinUrl) ? (
            <ButtonLink
              href={w.roomCode ? `/live/room/${w.roomCode}` : (w.joinUrl as string)}
              size="sm"
              className="flex-1"
            >
              <Video className="size-4" /> Join now
            </ButtonLink>
          ) : (
            <ButtonLink
              href={`/webinars/${w.slug}`}
              size="sm"
              variant={w.registered || isPast ? "outline" : "default"}
              className="flex-1"
            >
              {isPast ? "View details" : w.registered ? "View details" : "Register free"}
              <ArrowUpRight className="size-4" />
            </ButtonLink>
          )}
        </div>
      </div>
    </Card>
  );
}
