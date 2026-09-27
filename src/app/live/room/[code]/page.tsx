import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarClock, CalendarX, Lock } from "lucide-react";
import { requireUser } from "@/lib/auth/require";
import { getMeetingByRoomCode } from "@/server/services/live-service";
import { checkRoomAccess } from "@/server/services/live-access";
import { signRoomToken } from "@/lib/live/room-token";
import { LiveRoom } from "@/components/live/live-room";
import { WakeSignalling } from "@/components/live/wake-signalling";
import { Logo } from "@/components/shared/logo";
import { ButtonLink } from "@/components/shared/button-link";
import { ROLES } from "@/config/roles";
import { isStaffRole } from "@/lib/auth/api-guard";
import { isBatchTeachingTeam } from "@/lib/auth/class-guard";
import { isJoinLinkOpen, joinLinkOpensAt, JOIN_LINK_LEAD_HOURS } from "@/lib/class-link";
import { closedForHoliday } from "@/server/services/holiday-service";
import { formatIstSlot, istDateKey } from "@/lib/ist";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const meeting = await getMeetingByRoomCode(code);
  return { title: meeting ? `${meeting.title} · Live` : "Live room" };
}

export default async function LiveRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await params;
  // `?join=1` comes from the class email (and survives the sign-in round trip),
  // and means "open the class, not the lobby".
  const autoJoin = (await searchParams).join === "1";
  const user = await requireUser();
  const meeting = await getMeetingByRoomCode(code);
  if (!meeting) notFound();

  const allowed = await checkRoomAccess(user.id, user.role, meeting);
  if (!allowed) {
    return (
      <RoomAccessDenied
        title={meeting.title}
        courseTitle={meeting.courseTitle}
        courseSlug={meeting.courseSlug}
      />
    );
  }

  // The batch's lead and associate instructors run its classes together, so
  // any of them gets the host's controls — not only the one set as host.
  const isHost =
    meeting.host.id === user.id ||
    (meeting.batchId !== null &&
      !isStaffRole(user.role) &&
      (await isBatchTeachingTeam(user, meeting.batchId)));

  // Learners get a class's link 24 hours before it starts, and not at all once
  // it is cancelled. The teaching team and staff can always open the room.
  const isTeam =
    isHost ||
    user.role === ROLES.SUPER_ADMIN ||
    user.role === ROLES.ADMIN ||
    user.role === ROLES.INSTRUCTOR;
  if (!isTeam && meeting.provider !== "webinar") {
    if (meeting.status === "CANCELLED") {
      return (
        <RoomNotOpen
          icon="cancelled"
          heading="This class was cancelled"
          title={meeting.title}
          when={formatIstSlot(meeting.scheduledStart, meeting.scheduledEnd)}
          detail={meeting.cancelReason ? `Reason: ${meeting.cancelReason}` : null}
        />
      );
    }
    // A day the academy has closed takes its classes with it, whoever put them
    // on the calendar ("class ka link generate nhi hona chahiye usdin").
    const holiday = await closedForHoliday(istDateKey(new Date(meeting.scheduledStart)));
    if (holiday && meeting.status !== "LIVE") {
      return (
        <RoomNotOpen
          icon="cancelled"
          heading={`No class today — ${holiday.name}`}
          title={meeting.title}
          when={formatIstSlot(meeting.scheduledStart, meeting.scheduledEnd)}
          detail="Enjoy your holiday. Your teacher will let you know when this class is made up."
        />
      );
    }
    if (meeting.status === "SCHEDULED" && !isJoinLinkOpen(meeting.scheduledStart)) {
      return (
        <RoomNotOpen
          icon="early"
          heading={`The link opens ${JOIN_LINK_LEAD_HOURS} hours before class`}
          title={meeting.title}
          when={formatIstSlot(meeting.scheduledStart, meeting.scheduledEnd)}
          detail={`Come back from ${formatIstSlot(joinLinkOpensAt(meeting.scheduledStart))} — we'll email you the link the day before.`}
        />
      );
    }
  }

  const token = await signRoomToken({
    sub: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
    roomCode: meeting.roomCode,
    isHost,
  });
  // Read at request time (deliberately not NEXT_PUBLIC_*, which would be inlined
  // at build time and need a rebuild to repoint at a different signaling host).
  const signalUrl = process.env.SIGNAL_URL || "http://localhost:4001";

  return (
    <>
      {/* A room link opened straight from a message skips the dashboard, which
          is where the server is normally woken; the lobby buys it the time. */}
      <WakeSignalling url={signalUrl} />
      <LiveRoom
        meeting={meeting}
        me={{ id: user.id, name: user.name, role: user.role, avatarUrl: user.avatarUrl }}
        isHost={isHost}
        token={token}
        signalUrl={signalUrl}
        autoJoin={autoJoin}
      />
    </>
  );
}

function RoomNotOpen({
  icon,
  heading,
  title,
  when,
  detail,
}: {
  icon: "early" | "cancelled";
  heading: string;
  title: string;
  when: string;
  detail: string | null;
}) {
  const Icon = icon === "early" ? CalendarClock : CalendarX;
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-neutral-950 px-4 text-center text-white">
      <Logo onDark className="h-9" />
      <div className="max-w-md space-y-4">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white/10">
          <Icon className={icon === "early" ? "size-7 text-sky-300" : "size-7 text-rose-400"} />
        </span>
        <h1 className="text-2xl font-semibold">{heading}</h1>
        <p className="text-white/70">
          <span className="font-medium text-white">&ldquo;{title}&rdquo;</span>
          <br />
          {when}
        </p>
        {detail && <p className="text-sm text-white/60">{detail}</p>}
        <div className="flex justify-center pt-2">
          <ButtonLink
            href="/student/live"
            size="lg"
            variant="outline"
            className="border-white/20 bg-transparent text-white hover:bg-white/10"
          >
            Back to live classes
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

function RoomAccessDenied({
  title,
  courseTitle,
  courseSlug,
}: {
  title: string;
  courseTitle: string | null;
  courseSlug: string | null;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-neutral-950 px-4 text-center text-white">
      <Logo onDark className="h-9" />
      <div className="max-w-md space-y-4">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white/10">
          <Lock className="size-7 text-rose-400" />
        </span>
        <h1 className="text-2xl font-semibold">This live class is for enrolled learners</h1>
        <p className="text-white/70">
          You need to be enrolled in{" "}
          <span className="font-medium text-white">{courseTitle ?? "this course"}</span> to join{" "}
          <span className="font-medium text-white">&ldquo;{title}&rdquo;</span>.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
          {courseSlug && (
            <ButtonLink href={`/courses/${courseSlug}`} size="lg">
              View course
            </ButtonLink>
          )}
          <ButtonLink
            href="/student/live"
            size="lg"
            variant="outline"
            className="border-white/20 bg-transparent text-white hover:bg-white/10"
          >
            Back to live classes
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
