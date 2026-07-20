import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { requireUser } from "@/lib/auth/require";
import { getMeetingByRoomCode, checkRoomAccess } from "@/server/services/live-service";
import { signRoomToken } from "@/lib/live/room-token";
import { LiveRoom } from "@/components/live/live-room";
import { Logo } from "@/components/shared/logo";
import { ButtonLink } from "@/components/shared/button-link";

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
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
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

  const isHost = meeting.host.id === user.id;
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
    <LiveRoom
      meeting={meeting}
      me={{ id: user.id, name: user.name, role: user.role, avatarUrl: user.avatarUrl }}
      isHost={isHost}
      token={token}
      signalUrl={signalUrl}
    />
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
      <Logo />
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
