"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  MonitorUp,
  MessageSquare,
  Users,
  PhoneOff,
  Send,
  Circle,
  Copy,
  Check,
  ArrowLeft,
  Link2,
  Disc,
  ChevronDown,
  Loader2,
  WifiOff,
  AlertTriangle,
  Volume2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ROLE_HOME } from "@/config/roles";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLiveRoom, type PeerView } from "@/components/live/use-live-room";
import { cn } from "@/lib/utils";

interface Meeting {
  id: string;
  title: string;
  status: string;
  roomCode: string;
  /** "webrtc" | "offline" | "webinar" — webinar rooms keep their own register. */
  provider: string;
  isRecordingEnabled: boolean;
  host: { id: string; name: string; avatarUrl: string | null };
  courseTitle: string | null;
  batchName: string | null;
}
interface Me {
  id: string;
  name: string;
  role: string;
  avatarUrl: string | null;
}

/** How often a webinar room reports watch time. Often enough to survive a
 *  crashed tab, rare enough to stay out of the way of the call. */
const PRESENCE_INTERVAL_MS = 60_000;

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}
function fmtElapsed(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Columns for a given number of tiles.
 *
 * The grid rows are `auto-rows-fr` inside a container that is exactly as tall as
 * the space left over, so whatever this returns the tiles divide the room
 * between them and nothing is ever pushed off-screen. Phones get fewer columns
 * and taller tiles, because a 180px-wide face is not worth looking at.
 */
function gridColumns(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2";
  if (count === 3) return "grid-cols-1 sm:grid-cols-3";
  if (count <= 4) return "grid-cols-2";
  if (count <= 6) return "grid-cols-2 lg:grid-cols-3";
  if (count <= 9) return "grid-cols-2 sm:grid-cols-3";
  return "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4";
}

export function LiveRoom({
  meeting,
  me,
  isHost,
  token,
  signalUrl,
}: {
  meeting: Meeting;
  me: Me;
  isHost: boolean;
  token: string;
  signalUrl: string;
}) {
  const router = useRouter();
  const selfVideoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [joined, setJoined] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [panel, setPanel] = useState<"chat" | "people" | null>(null);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [recording, setRecording] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [dismissedNotice, setDismissedNotice] = useState(false);

  const room = useLiveRoom({
    signalUrl,
    token,
    joined,
    selfName: me.name,
    isHost,
  });

  const {
    localStream,
    screenStream,
    mediaStatus,
    mediaMessage,
    micOn,
    camOn,
    sharing,
    speaking,
    cameras,
    microphones,
    cameraId,
    micId,
    peers,
    socketConnected,
    signalError,
    messages,
    meshLimit,
    participantCount,
    overMeshLimit,
    videoHeld,
    endedBy,
    sessionElsewhere,
  } = room;

  // Bind the self tile to whichever stream is being shown: the screen when
  // sharing, the camera otherwise. Muted, always — an unmuted local tile is
  // where classroom echo comes from.
  useEffect(() => {
    const el = selfVideoRef.current;
    if (!el) return;
    const next = sharing ? screenStream : localStream;
    if (el.srcObject !== next) el.srcObject = next;
    el.play().catch(() => {
      /* a muted local preview is allowed to autoplay everywhere */
    });
  }, [joined, sharing, screenStream, localStream]);

  // Elapsed timer once joined.
  useEffect(() => {
    if (!joined) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [joined]);

  /**
   * Webinar attendance, taken automatically: the room reports how long this
   * viewer has had it open, and the server keeps the high-water mark. Sitting
   * through the whole session is what earns the extra discount, so nobody
   * should have to tick a register for it.
   */
  useEffect(() => {
    if (!joined || meeting.provider !== "webinar") return;

    const startedAt = Date.now();
    const url = "/api/webinars/presence";

    function report(final = false) {
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      const body = JSON.stringify({ roomCode: meeting.roomCode, seconds });
      // A closing tab won't wait for fetch; a beacon survives it.
      if (final && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
        return;
      }
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }

    const t = setInterval(() => report(), PRESENCE_INTERVAL_MS);
    const onHidden = () => {
      if (document.visibilityState === "hidden") report(true);
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onHidden);
      report(true);
    };
  }, [joined, meeting.provider, meeting.roomCode]);

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    setRecording(false);
  }

  function startRecording() {
    const base = localStream;
    if (!base) {
      toast.error("No media available to record.");
      return;
    }
    const videoTrack = sharing
      ? screenStream?.getVideoTracks()[0]
      : base.getVideoTracks()[0];
    const audioTrack = base.getAudioTracks()[0];
    const tracks = [videoTrack, audioTrack].filter(Boolean) as MediaStreamTrack[];
    const recStream = new MediaStream(tracks);
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";
    const rec = new MediaRecorder(recStream, { mimeType: mime });
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      if (blob.size === 0) return;
      const fd = new FormData();
      fd.append("file", blob, `recording-${meeting.roomCode}.webm`);
      try {
        const res = await fetch(`/api/meetings/${meeting.id}/recording`, {
          method: "POST",
          body: fd,
        });
        if (res.ok) toast.success("Recording saved.");
        else toast.error("Couldn't save recording.");
      } catch {
        toast.error("Couldn't upload recording.");
      }
    };
    rec.start();
    recorderRef.current = rec;
    setRecording(true);
    toast.success("Recording started.");
  }

  function goHome() {
    router.push(ROLE_HOME[me.role as keyof typeof ROLE_HOME] ?? "/");
  }
  function leave() {
    stopRecording();
    room.teardown();
    goHome();
  }
  function endForEveryone() {
    room.endClass();
    leave();
  }

  async function onToggleShare() {
    const problem = await room.toggleShare();
    if (problem) toast.error(problem);
  }

  function sendMessage(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    room.sendChat(text);
    setDraft("");
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success("Invite link copied.");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy.");
    }
  }

  const cancelled = meeting.status === "CANCELLED";
  const ended = meeting.status === "ENDED";
  const showSelfVideo = sharing || (camOn && Boolean(localStream?.getVideoTracks().length));

  // ── The class is over, or this person is in here twice ──────────────────────
  if (joined && (endedBy || sessionElsewhere)) {
    return (
      <RoomMessage
        icon={sessionElsewhere ? <Users className="size-7 text-rose-400" /> : <PhoneOff className="size-7 text-rose-400" />}
        title={sessionElsewhere ? "You joined this class somewhere else" : `${endedBy} ended the class`}
        body={
          sessionElsewhere
            ? "This class is now open in another tab or on another device. Two copies of the same microphone in one room is what causes echo, so this one stepped aside."
            : "The host has closed the room for everyone. Any recording will appear under the class once it has been processed."
        }
        action={
          <Button size="lg" onClick={goHome}>
            Back to my classes
          </Button>
        }
      />
    );
  }

  // ── Lobby ──────────────────────────────────────────────────────────────────
  if (!joined) {
    return (
      <div className="fixed inset-0 flex flex-col overflow-y-auto bg-neutral-950 text-white">
        {/* brand glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background:radial-gradient(48rem_28rem_at_12%_-8%,rgba(244,63,94,0.20),transparent),radial-gradient(42rem_26rem_at_105%_115%,rgba(139,92,246,0.16),transparent)]"
        />

        <header className="relative flex items-center gap-3 p-5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={leave}
            className="text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Back"
          >
            <ArrowLeft className="size-5" />
          </Button>
          <Logo href="/" />
        </header>

        <div className="relative flex flex-1 items-center justify-center p-4 sm:p-6">
          <div className="grid w-full max-w-5xl items-center gap-8 lg:grid-cols-[1.5fr_1fr] lg:gap-12">
            {/* Preview */}
            <div
              className="relative aspect-video overflow-hidden rounded-3xl bg-neutral-900 shadow-2xl ring-1 ring-white/10"
              data-tile="lobby"
            >
              <video
                ref={selfVideoRef}
                autoPlay
                playsInline
                muted
                className={cn(
                  "size-full object-cover [transform:scaleX(-1)]",
                  !showSelfVideo && "invisible",
                )}
              />
              {!showSelfVideo && (
                <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-neutral-900 to-neutral-950">
                  <Avatar className="size-28 ring-4 ring-white/5">
                    {me.avatarUrl && <AvatarImage src={me.avatarUrl} alt={me.name} />}
                    <AvatarFallback className="bg-gradient-to-br from-rose-500 to-pink-600 text-4xl text-white">
                      {initials(me.name)}
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}
              <MediaNotice
                status={mediaStatus}
                message={mediaMessage}
                onRetry={room.retryMedia}
              />
              <div className="absolute bottom-3 left-3 rounded-md bg-black/45 px-2.5 py-1 text-xs backdrop-blur">
                {me.name}
              </div>
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2.5">
                <DeviceControl
                  on={micOn}
                  onToggle={room.toggleMic}
                  label="mic"
                  IconOn={Mic}
                  IconOff={MicOff}
                  devices={microphones}
                  deviceId={micId}
                  onSelect={room.selectMicrophone}
                  pickerLabel="Microphone"
                />
                <DeviceControl
                  on={camOn}
                  onToggle={room.toggleCam}
                  label="camera"
                  IconOn={VideoIcon}
                  IconOff={VideoOff}
                  devices={cameras}
                  deviceId={cameraId}
                  onSelect={room.selectCamera}
                  pickerLabel="Camera"
                />
              </div>
            </div>

            {/* Join card */}
            <div className="flex flex-col gap-5 text-center lg:text-left">
              <div>
                <Badge
                  variant="secondary"
                  className={cn(
                    "mb-3 gap-1.5",
                    meeting.status === "LIVE"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-white/10 text-white/80",
                  )}
                >
                  {meeting.status === "LIVE" && <Circle className="size-2 animate-pulse fill-current" />}
                  {meeting.status === "LIVE"
                    ? "Live now"
                    : meeting.status.charAt(0) + meeting.status.slice(1).toLowerCase()}
                </Badge>
                <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
                  {meeting.title}
                </h1>
                <p className="mt-2 text-sm text-white/60">
                  Hosted by <span className="text-white/80">{meeting.host.name}</span>
                  {meeting.courseTitle ? ` · ${meeting.courseTitle}` : ""}
                </p>
              </div>

              {cancelled ? (
                <p className="rounded-lg bg-rose-500/15 px-4 py-3 text-sm text-rose-200">
                  This live class was cancelled.
                </p>
              ) : ended ? (
                <p className="rounded-lg bg-white/5 px-4 py-3 text-sm text-white/70">
                  This class has ended. You can still enter the room.
                </p>
              ) : null}

              <div className="space-y-3">
                <Button
                  size="lg"
                  onClick={() => setJoined(true)}
                  className="w-full text-base"
                  data-testid="join-now"
                >
                  Join now
                </Button>
                <div className="flex items-center justify-center gap-4 text-xs text-white/50 lg:justify-start">
                  <span className="flex items-center gap-1.5">
                    {micOn ? <Mic className="size-3.5" /> : <MicOff className="size-3.5 text-rose-400" />}
                    {micOn ? "Mic on" : "Mic off"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {camOn ? <VideoIcon className="size-3.5" /> : <VideoOff className="size-3.5 text-rose-400" />}
                    {camOn ? "Camera on" : "Camera off"}
                  </span>
                  <button
                    type="button"
                    onClick={copyLink}
                    className="flex items-center gap-1.5 hover:text-white/80"
                  >
                    {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
                    Invite
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── In-room ────────────────────────────────────────────────────────────────
  const tileCount = participantCount;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-neutral-950 text-white">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Logo href="/" showText={false} />
          <span className="truncate text-sm font-semibold sm:text-base">{meeting.title}</span>
          {recording && (
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-rose-300">
              <Circle className="size-2 animate-pulse fill-current" /> REC
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm text-white/70 sm:gap-3">
          <span
            className={cn(
              "flex items-center gap-1.5",
              socketConnected ? "text-emerald-300" : "text-amber-300",
            )}
            title={socketConnected ? "Connected to the class server" : "Reconnecting to the class server…"}
            data-testid="signal-state"
            data-connected={socketConnected ? "true" : "false"}
          >
            {socketConnected ? (
              <Circle className="size-2 fill-current" />
            ) : (
              <WifiOff className="size-3.5" />
            )}
            <Users className="size-4" />
            <span data-testid="participant-count">{tileCount}</span>
          </span>
          <span className="tabular-nums">{fmtElapsed(elapsed)}</span>
          <span className="hidden font-mono text-xs sm:inline">{meeting.roomCode}</span>
        </div>
      </header>

      {/* Notices that matter enough to sit above the faces */}
      {signalError && (
        <Notice tone="warn" icon={<WifiOff className="size-4" />} text={signalError} />
      )}
      {mediaStatus !== "ready" && mediaStatus !== "starting" && (
        <Notice
          tone={mediaStatus === "audio-only" ? "warn" : "error"}
          icon={<AlertTriangle className="size-4" />}
          text={mediaMessage ?? "Your camera and microphone aren't available."}
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={room.retryMedia}
              className="h-7 border-white/25 bg-transparent text-white hover:bg-white/10"
            >
              Retry
            </Button>
          }
        />
      )}
      {overMeshLimit && !dismissedNotice && (
        <Notice
          tone="warn"
          icon={<Users className="size-4" />}
          text={
            isHost
              ? `${tileCount} people are in the room. Browser-to-browser video tops out around ${meshLimit} — everyone can still hear each other, but video is now limited to you and whoever is speaking.`
              : `A big class: everyone can hear each other, but video is limited to the host and whoever is speaking${videoHeld ? ", so your camera is paused for now" : ""}.`
          }
          action={
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setDismissedNotice(true)}
              aria-label="Dismiss"
              className="text-white/70 hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" />
            </Button>
          }
        />
      )}

      {/* Body */}
      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 p-2 sm:p-4">
          <div
            className={cn(
              "mx-auto grid h-full w-full auto-rows-fr gap-2 sm:gap-3",
              tileCount <= 2 ? "max-w-6xl" : "max-w-7xl",
              gridColumns(tileCount),
            )}
            data-testid="tile-grid"
          >
            {/* Self tile */}
            <div
              className={cn(
                "relative min-h-0 overflow-hidden rounded-2xl bg-neutral-900 ring-1 ring-white/10",
                speaking && micOn && "ring-2 ring-emerald-400",
              )}
              data-tile="self"
            >
              <video
                ref={selfVideoRef}
                autoPlay
                playsInline
                muted
                className={cn(
                  "size-full object-cover",
                  !sharing && "[transform:scaleX(-1)]",
                  !showSelfVideo && "invisible",
                )}
              />
              {!showSelfVideo && (
                <div className="absolute inset-0 grid place-items-center">
                  <Avatar className="size-16 sm:size-20">
                    {me.avatarUrl && <AvatarImage src={me.avatarUrl} alt={me.name} />}
                    <AvatarFallback className="bg-gradient-to-br from-rose-500 to-pink-600 text-xl text-white sm:text-2xl">
                      {initials(me.name)}
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}
              <TileLabel
                name={`You${isHost ? " (Host)" : ""}`}
                micOn={micOn}
                sharing={sharing}
                videoHeld={videoHeld}
              />
            </div>

            {/* Remote peer tiles */}
            {peers.map((peer) => (
              <PeerTile key={peer.socketId} peer={peer} />
            ))}

            {/* Invite tile — shown only while you're alone */}
            {peers.length === 0 && (
              <div className="flex min-h-0 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-4 text-center">
                <Users className="size-8 text-white/40" />
                <div>
                  <p className="text-sm font-medium">Waiting for others to join</p>
                  <p className="mt-0.5 text-xs text-white/50">Share the invite link to bring people in.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyLink}
                  className="border-white/20 bg-transparent text-white hover:bg-white/10"
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Side panel — an overlay on a phone, a column from md up */}
        {panel && (
          <aside className="absolute inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col border-l border-white/10 bg-neutral-900 md:static md:z-auto md:max-w-xs">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-sm font-semibold">
                {panel === "chat" ? "Chat" : `Participants (${tileCount})`}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setPanel(null)}
                className="text-white hover:bg-white/10"
                aria-label="Close panel"
              >
                <X className="size-4" />
              </Button>
            </div>

            {panel === "people" ? (
              <div className="flex-1 space-y-1 overflow-y-auto p-2">
                <PersonRow
                  name={`${me.name} (You)`}
                  sub={isHost ? "Host" : "Attendee"}
                  avatarUrl={me.avatarUrl}
                  muted={!micOn}
                />
                {peers.map((peer) => (
                  <PersonRow
                    key={peer.socketId}
                    name={peer.user.name || "Guest"}
                    sub={
                      peer.status === "connected"
                        ? peer.user.isHost
                          ? "Host"
                          : "Attendee"
                        : peer.status === "failed"
                          ? "Can't connect"
                          : "Connecting…"
                    }
                    avatarUrl={peer.user.avatarUrl}
                    muted={!peer.state.micOn}
                  />
                ))}
              </div>
            ) : (
              <>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {messages.length === 0 ? (
                    <p className="text-center text-xs text-white/40">No messages yet. Say hello 👋</p>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className={cn("text-sm", m.me && "text-right")}>
                        <p className="text-xs text-white/40">{m.from}</p>
                        <p className={cn("inline-block rounded-lg px-3 py-1.5", m.me ? "bg-primary text-white" : "bg-white/10")}>
                          {m.text}
                        </p>
                      </div>
                    ))
                  )}
                </div>
                <form onSubmit={sendMessage} className="flex gap-2 border-t border-white/10 p-3">
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Message…"
                    className="border-white/15 bg-white/5 text-white placeholder:text-white/40"
                  />
                  <Button type="submit" size="icon" aria-label="Send">
                    <Send className="size-4" />
                  </Button>
                </form>
              </>
            )}
          </aside>
        )}
      </div>

      {/* Controls */}
      <footer className="flex shrink-0 items-center justify-center gap-1.5 border-t border-white/10 px-2 py-3 sm:gap-3 sm:px-4 sm:py-4">
        <DeviceControl
          on={micOn}
          onToggle={room.toggleMic}
          label="mic"
          IconOn={Mic}
          IconOff={MicOff}
          devices={microphones}
          deviceId={micId}
          onSelect={room.selectMicrophone}
          pickerLabel="Microphone"
        />
        <DeviceControl
          on={camOn}
          onToggle={room.toggleCam}
          label="camera"
          IconOn={VideoIcon}
          IconOff={VideoOff}
          devices={cameras}
          deviceId={cameraId}
          onSelect={room.selectCamera}
          pickerLabel="Camera"
        />
        <RoundButton active={sharing} onClick={onToggleShare} label="Share screen">
          <MonitorUp className="size-5" />
        </RoundButton>
        <RoundButton
          active={panel === "chat"}
          onClick={() => setPanel(panel === "chat" ? null : "chat")}
          label="Chat"
        >
          <MessageSquare className="size-5" />
        </RoundButton>
        <RoundButton
          active={panel === "people"}
          onClick={() => setPanel(panel === "people" ? null : "people")}
          label="Participants"
        >
          <Users className="size-5" />
        </RoundButton>
        {isHost && (
          <button
            type="button"
            onClick={() => (recording ? stopRecording() : startRecording())}
            aria-label={recording ? "Stop recording" : "Start recording"}
            aria-pressed={recording}
            className={cn(
              "grid size-11 place-items-center rounded-full transition-colors",
              recording ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-white/10 text-white hover:bg-white/20",
            )}
          >
            <Disc className={cn("size-5", recording && "animate-pulse")} />
          </button>
        )}
        <button
          type="button"
          onClick={() => (isHost ? setConfirmEnd(true) : leave())}
          aria-label={isHost ? "End class" : "Leave"}
          className="ml-1 flex h-11 items-center gap-2 rounded-full bg-rose-600 px-4 font-medium text-white transition-colors hover:bg-rose-700 sm:px-5"
        >
          <PhoneOff className="size-5" />
          <span className="hidden sm:inline">{isHost ? "End" : "Leave"}</span>
        </button>
      </footer>

      <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this class for everyone?</AlertDialogTitle>
            <AlertDialogDescription>
              Everyone still in the room will be told you ended it and returned to their
              dashboard. Choose &ldquo;Just leave&rdquo; if the class should carry on without you.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <Button variant="outline" onClick={leave}>
              Just leave
            </Button>
            <AlertDialogAction
              onClick={endForEveryone}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              End for everyone
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * One remote participant.
 *
 * The <video> is bound in an effect and explicitly asked to play: iOS Safari
 * will not start a stream with sound on its own, and when it refuses the tile
 * offers a tap rather than sitting there silently. It is never muted — muting
 * the remote tiles is exactly how a "nobody can hear anyone" class happens.
 */
function PeerTile({ peer }: { peer: PeerView }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [needsTap, setNeedsTap] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !peer.stream) return;
    if (el.srcObject !== peer.stream) el.srcObject = peer.stream;
    el.play()
      .then(() => setNeedsTap(false))
      .catch(() => setNeedsTap(true));
  }, [peer.stream]);

  const showVideo = peer.hasVideo && (peer.state.camOn || peer.state.sharing);

  return (
    <div
      className={cn(
        "relative min-h-0 overflow-hidden rounded-2xl bg-neutral-900 ring-1 ring-white/10",
        peer.state.speaking && peer.state.micOn && "ring-2 ring-emerald-400",
      )}
      data-tile="remote"
      data-peer-id={peer.socketId}
      data-peer-status={peer.status}
      data-peer-video={showVideo ? "on" : "off"}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        data-peer-video-el={peer.socketId}
        className={cn("size-full object-cover", !showVideo && "invisible")}
      />
      {!showVideo && (
        <div className="absolute inset-0 grid place-items-center">
          <Avatar className="size-16 sm:size-20">
            {peer.user.avatarUrl && <AvatarImage src={peer.user.avatarUrl} alt={peer.user.name} />}
            <AvatarFallback className="bg-white/10 text-xl text-white sm:text-2xl">
              {initials(peer.user.name || "?")}
            </AvatarFallback>
          </Avatar>
        </div>
      )}

      {(peer.status === "connecting" || peer.status === "reconnecting") && (
        <div className="absolute inset-0 grid place-items-center bg-neutral-950/60 backdrop-blur-sm">
          <span className="flex items-center gap-2 text-xs text-white/80">
            <Loader2 className="size-4 animate-spin" />
            {peer.status === "reconnecting" ? "Reconnecting…" : "Connecting…"}
          </span>
        </div>
      )}
      {peer.status === "failed" && (
        <div className="absolute inset-0 grid place-items-center bg-neutral-950/70 p-3 text-center backdrop-blur-sm">
          <span className="text-xs text-white/80">
            <AlertTriangle className="mx-auto mb-1 size-4 text-amber-300" />
            Couldn&apos;t connect to {peer.user.name || "this person"}. Their network is
            blocking the call.
          </span>
        </div>
      )}
      {needsTap && (
        <button
          type="button"
          onClick={() => ref.current?.play().then(() => setNeedsTap(false)).catch(() => {})}
          className="absolute inset-x-2 top-2 flex items-center justify-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs backdrop-blur"
        >
          <Volume2 className="size-3.5" /> Tap to hear {peer.user.name || "them"}
        </button>
      )}

      <TileLabel
        name={`${peer.user.name || "Guest"}${peer.user.isHost ? " (Host)" : ""}`}
        micOn={peer.state.micOn}
        sharing={peer.state.sharing}
        videoHeld={peer.state.videoHeld}
      />
    </div>
  );
}

function TileLabel({
  name,
  micOn,
  sharing,
  videoHeld,
}: {
  name: string;
  micOn: boolean;
  sharing: boolean;
  videoHeld: boolean;
}) {
  return (
    <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-xs backdrop-blur">
      {!micOn && <MicOff className="size-3.5 shrink-0 text-rose-300" data-testid="muted-badge" />}
      <span className="truncate">{name}</span>
      {sharing && <span className="shrink-0 text-white/60">· sharing</span>}
      {videoHeld && <span className="shrink-0 text-white/60">· video paused</span>}
    </div>
  );
}

/** Mic or camera button, with the device list hanging off its own little chevron. */
function DeviceControl({
  on,
  onToggle,
  label,
  IconOn,
  IconOff,
  devices,
  deviceId,
  onSelect,
  pickerLabel,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  IconOn: typeof Mic;
  IconOff: typeof Mic;
  devices: { deviceId: string; label: string }[];
  deviceId: string | undefined;
  onSelect: (id: string) => void | Promise<void>;
  pickerLabel: string;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-label={`${on ? "Turn off" : "Turn on"} ${label}`}
        aria-pressed={!on}
        data-testid={`toggle-${label}`}
        className={cn(
          "grid size-11 place-items-center rounded-full transition-colors",
          on ? "bg-white/10 text-white hover:bg-white/20" : "bg-rose-600 text-white hover:bg-rose-700",
        )}
      >
        {on ? <IconOn className="size-5" /> : <IconOff className="size-5" />}
      </button>
      {devices.length > 1 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Choose ${pickerLabel.toLowerCase()}`}
            className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-neutral-800 text-white ring-1 ring-white/20 hover:bg-neutral-700"
          >
            <ChevronDown className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-w-[18rem]">
            <DropdownMenuLabel>{pickerLabel}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={deviceId ?? ""}
              onValueChange={(v) => void onSelect(String(v))}
            >
              {devices.map((d) => (
                <DropdownMenuRadioItem key={d.deviceId} value={d.deviceId}>
                  <span className="truncate">{d.label}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function RoundButton({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "grid size-11 place-items-center rounded-full transition-colors",
        active ? "bg-white text-neutral-900" : "bg-white/10 text-white hover:bg-white/20",
      )}
    >
      {children}
    </button>
  );
}

function Notice({
  tone,
  icon,
  text,
  action,
}: {
  tone: "warn" | "error";
  icon: React.ReactNode;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      role="status"
      data-testid="room-notice"
      className={cn(
        "flex shrink-0 items-center justify-center gap-2 px-3 py-2 text-center text-xs",
        tone === "error" ? "bg-rose-950/70 text-rose-100" : "bg-amber-950/60 text-amber-100",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="max-w-3xl">{text}</span>
      {action}
    </div>
  );
}

/** The lobby's version of the same message, laid over the preview. */
function MediaNotice({
  status,
  message,
  onRetry,
}: {
  status: string;
  message: string | null;
  onRetry: () => void | Promise<void>;
}) {
  if (status === "ready" || status === "starting" || !message) return null;
  return (
    <div
      className="absolute inset-x-3 top-3 flex flex-col items-center gap-2 rounded-xl bg-black/70 px-3 py-2.5 text-center text-xs text-white/85 backdrop-blur"
      data-testid="media-notice"
    >
      <span>{message}</span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => void onRetry()}
        className="h-7 border-white/25 bg-transparent text-white hover:bg-white/10"
        data-testid="retry-media"
      >
        Retry
      </Button>
    </div>
  );
}

function RoomMessage({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-neutral-950 px-4 text-center text-white"
      data-testid="room-message"
    >
      <Logo />
      <span className="flex size-14 items-center justify-center rounded-2xl bg-white/10">{icon}</span>
      <div className="max-w-md space-y-3">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-white/70">{body}</p>
      </div>
      {action}
    </div>
  );
}

function PersonRow({
  name,
  sub,
  avatarUrl,
  muted,
}: {
  name: string;
  sub: string;
  avatarUrl: string | null;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5">
      <Avatar className="size-8">
        {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
        <AvatarFallback className="bg-white/10 text-xs text-white">{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{name}</p>
        <p className="truncate text-xs text-white/40">{sub}</p>
      </div>
      {muted && <MicOff className="size-4 text-white/40" />}
    </div>
  );
}
