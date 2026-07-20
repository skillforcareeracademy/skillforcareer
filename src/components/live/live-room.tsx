"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
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
} from "lucide-react";
import { toast } from "sonner";
import { ROLE_HOME } from "@/config/roles";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface Meeting {
  id: string;
  title: string;
  status: string;
  roomCode: string;
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
interface RoomUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  isHost: boolean;
}
interface RemotePeer {
  socketId: string;
  user: RoomUser;
  stream: MediaStream | null;
}
interface ChatMessage {
  from: string;
  text: string;
  me: boolean;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [joined, setJoined] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [panel, setPanel] = useState<"chat" | "people" | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [recording, setRecording] = useState(false);
  const [connected, setConnected] = useState(false);

  // Acquire camera + mic once.
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: 1280, height: 720 }, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => !cancelled && setMediaError(true));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      screenRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Keep the visible <video> bound to the active stream across lobby↔room.
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = sharing ? screenRef.current : streamRef.current;
    }
  }, [joined, sharing, camOn]);

  // Elapsed timer once joined.
  useEffect(() => {
    if (!joined) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [joined]);

  // Signaling + WebRTC mesh once joined.
  useEffect(() => {
    if (!joined) return;
    const socket = io(signalUrl, {
      auth: { token },
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    const upsert = (socketId: string, user: RoomUser) =>
      setRemotePeers((prev) =>
        prev.some((p) => p.socketId === socketId)
          ? prev.map((p) => (p.socketId === socketId && p.user.id === "" ? { ...p, user } : p))
          : [...prev, { socketId, user, stream: null }],
      );
    const setStream = (socketId: string, stream: MediaStream) =>
      setRemotePeers((prev) => prev.map((p) => (p.socketId === socketId ? { ...p, stream } : p)));
    const drop = (socketId: string) => {
      peersRef.current.get(socketId)?.close();
      peersRef.current.delete(socketId);
      pendingIceRef.current.delete(socketId);
      setRemotePeers((prev) => prev.filter((p) => p.socketId !== socketId));
    };

    function makePeer(socketId: string, user: RoomUser, initiator: boolean) {
      upsert(socketId, user);
      const existing = peersRef.current.get(socketId);
      if (existing) return existing;
      const pc = new RTCPeerConnection(RTC_CONFIG);
      peersRef.current.set(socketId, pc);
      streamRef.current?.getTracks().forEach((t) => pc.addTrack(t, streamRef.current!));
      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit("signal", { to: socketId, candidate: e.candidate });
      };
      pc.ontrack = (e) => setStream(socketId, e.streams[0]);
      if (initiator) {
        pc.createOffer()
          .then((o) => pc.setLocalDescription(o))
          .then(() => socket.emit("signal", { to: socketId, description: pc.localDescription }))
          .catch(() => {});
      }
      return pc;
    }

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));

    socket.on("peers", (peers: { socketId: string; user: RoomUser }[]) => {
      peers.forEach((p) => makePeer(p.socketId, p.user, true));
    });
    socket.on("peer-joined", ({ socketId, user }: { socketId: string; user: RoomUser }) => {
      upsert(socketId, user);
    });
    socket.on(
      "signal",
      async ({
        from,
        description,
        candidate,
      }: {
        from: string;
        description?: RTCSessionDescriptionInit;
        candidate?: RTCIceCandidateInit;
      }) => {
        const pc =
          peersRef.current.get(from) ??
          makePeer(from, { id: "", name: "Guest", avatarUrl: null, isHost: false }, false);
        if (description) {
          await pc.setRemoteDescription(description).catch(() => {});
          const queued = pendingIceRef.current.get(from) ?? [];
          for (const c of queued) await pc.addIceCandidate(c).catch(() => {});
          pendingIceRef.current.delete(from);
          if (description.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("signal", { to: from, description: pc.localDescription });
          }
        } else if (candidate) {
          if (pc.remoteDescription?.type) {
            await pc.addIceCandidate(candidate).catch(() => {});
          } else {
            const q = pendingIceRef.current.get(from) ?? [];
            q.push(candidate);
            pendingIceRef.current.set(from, q);
          }
        }
      },
    );
    socket.on("peer-left", ({ socketId }: { socketId: string }) => drop(socketId));
    socket.on("chat", (msg: { name: string; text: string }) =>
      setMessages((m) => [...m, { from: msg.name, text: msg.text, me: false }]),
    );

    const peers = peersRef.current;
    const pending = pendingIceRef.current;
    return () => {
      socket.disconnect();
      peers.forEach((pc) => pc.close());
      peers.clear();
      pending.clear();
      setRemotePeers([]);
      setConnected(false);
    };
  }, [joined, signalUrl, token]);

  function toggleMic() {
    const next = !micOn;
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
  }
  function toggleCam() {
    const next = !camOn;
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
    setCamOn(next);
  }
  function swapVideoTrackToPeers(track: MediaStreamTrack | undefined) {
    if (!track) return;
    peersRef.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      sender?.replaceTrack(track).catch(() => {});
    });
  }
  async function toggleShare() {
    if (sharing) {
      swapVideoTrackToPeers(streamRef.current?.getVideoTracks()[0]);
      screenRef.current?.getTracks().forEach((t) => t.stop());
      screenRef.current = null;
      setSharing(false);
      return;
    }
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenRef.current = s;
      swapVideoTrackToPeers(s.getVideoTracks()[0]);
      setSharing(true);
      s.getVideoTracks()[0]?.addEventListener("ended", () => {
        swapVideoTrackToPeers(streamRef.current?.getVideoTracks()[0]);
        screenRef.current = null;
        setSharing(false);
      });
    } catch {
      /* user cancelled the picker */
    }
  }

  function startRecording() {
    const base = streamRef.current;
    if (!base) {
      toast.error("No media available to record.");
      return;
    }
    const videoTrack = sharing ? screenRef.current?.getVideoTracks()[0] : base.getVideoTracks()[0];
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
  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    setRecording(false);
  }

  function leave() {
    stopRecording();
    socketRef.current?.disconnect();
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    screenRef.current?.getTracks().forEach((t) => t.stop());
    router.push(ROLE_HOME[me.role as keyof typeof ROLE_HOME] ?? "/");
  }
  function sendMessage(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    socketRef.current?.emit("chat", { text });
    setMessages((m) => [...m, { from: me.name, text, me: true }]);
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

  // ── Lobby ──────────────────────────────────────────────────────────────────
  if (!joined) {
    return (
      <div className="fixed inset-0 flex flex-col overflow-hidden bg-neutral-950 text-white">
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
            <div className="relative aspect-video overflow-hidden rounded-3xl bg-neutral-900 shadow-2xl ring-1 ring-white/10">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={cn(
                  "size-full object-cover [transform:scaleX(-1)]",
                  !camOn && "invisible",
                )}
              />
              {!camOn && (
                <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-neutral-900 to-neutral-950">
                  <Avatar className="size-28 ring-4 ring-white/5">
                    {me.avatarUrl && <AvatarImage src={me.avatarUrl} alt={me.name} />}
                    <AvatarFallback className="bg-gradient-to-br from-rose-500 to-pink-600 text-4xl text-white">
                      {initials(me.name)}
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}
              {mediaError && (
                <div className="absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-black/60 px-3 py-1.5 text-center text-xs text-white/80 backdrop-blur">
                  Camera & mic are blocked — you can still join
                </div>
              )}
              <div className="absolute bottom-3 left-3 rounded-md bg-black/45 px-2.5 py-1 text-xs backdrop-blur">
                {me.name}
              </div>
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2.5">
                <ControlButton on={micOn} onClick={toggleMic} label="mic" IconOn={Mic} IconOff={MicOff} />
                <ControlButton on={camOn} onClick={toggleCam} label="camera" IconOn={VideoIcon} IconOff={VideoOff} />
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
                <Button size="lg" onClick={() => setJoined(true)} className="w-full text-base">
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
  return (
    <div className="fixed inset-0 flex flex-col bg-neutral-950 text-white">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Logo href="/" showText={false} />
          <span className="truncate font-semibold">{meeting.title}</span>
          {recording && (
            <span className="flex items-center gap-1.5 text-xs text-rose-300">
              <Circle className="size-2 animate-pulse fill-current" /> REC
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-white/70">
          <span
            className={cn(
              "flex items-center gap-1.5",
              connected ? "text-emerald-300" : "text-white/40",
            )}
            title={connected ? "Connected" : "Connecting…"}
          >
            <Circle className="size-2 fill-current" />
            <Users className="size-4" /> {1 + remotePeers.length}
          </span>
          <span className="tabular-nums">{fmtElapsed(elapsed)}</span>
          <span className="hidden font-mono text-xs sm:inline">{meeting.roomCode}</span>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        <div className="flex flex-1 items-center justify-center p-3 sm:p-6">
          <div
            className={cn(
              "mx-auto grid w-full max-w-5xl gap-3",
              remotePeers.length + 1 > 4
                ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                : "grid-cols-1 sm:grid-cols-2",
            )}
          >
            {/* Self tile */}
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-neutral-900 ring-1 ring-white/10">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={cn(
                  "size-full object-cover",
                  !sharing && "[transform:scaleX(-1)]",
                  !camOn && !sharing && "invisible",
                )}
              />
              {!camOn && !sharing && (
                <div className="absolute inset-0 grid place-items-center">
                  <Avatar className="size-20">
                    {me.avatarUrl && <AvatarImage src={me.avatarUrl} alt={me.name} />}
                    <AvatarFallback className="bg-gradient-to-br from-rose-500 to-pink-600 text-2xl text-white">
                      {initials(me.name)}
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}
              <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/50 px-2 py-1 text-xs backdrop-blur">
                {!micOn && <MicOff className="size-3.5 text-rose-300" />}
                You {isHost ? "(Host)" : ""}
                {sharing && " · sharing screen"}
              </div>
            </div>

            {/* Remote peer tiles */}
            {remotePeers.map((peer) => (
              <div
                key={peer.socketId}
                className="relative aspect-video overflow-hidden rounded-2xl bg-neutral-900 ring-1 ring-white/10"
              >
                {peer.stream ? (
                  <video
                    autoPlay
                    playsInline
                    ref={(el) => {
                      if (el && peer.stream && el.srcObject !== peer.stream) {
                        el.srcObject = peer.stream;
                      }
                    }}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center">
                    <Avatar className="size-20">
                      {peer.user.avatarUrl && (
                        <AvatarImage src={peer.user.avatarUrl} alt={peer.user.name} />
                      )}
                      <AvatarFallback className="bg-white/10 text-2xl text-white">
                        {initials(peer.user.name || "?")}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                )}
                <div className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-1 text-xs backdrop-blur">
                  {peer.user.name || "Guest"}
                  {peer.user.isHost ? " (Host)" : ""}
                </div>
              </div>
            ))}

            {/* Invite tile — shown only while you're alone */}
            {remotePeers.length === 0 && (
              <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-center">
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

        {/* Side panel */}
        {panel && (
          <aside className="flex w-full max-w-xs flex-col border-l border-white/10 bg-neutral-900">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-sm font-semibold">
                {panel === "chat" ? "Chat" : "Participants"}
              </span>
              <Button variant="ghost" size="icon-sm" onClick={() => setPanel(null)} className="text-white hover:bg-white/10">
                <ArrowLeft className="size-4" />
              </Button>
            </div>

            {panel === "people" ? (
              <div className="flex-1 space-y-1 overflow-y-auto p-2">
                <PersonRow name={`${me.name} (You)`} sub={isHost ? "Host" : "Attendee"} avatarUrl={me.avatarUrl} muted={!micOn} />
                {remotePeers.map((peer) => (
                  <PersonRow
                    key={peer.socketId}
                    name={peer.user.name || "Guest"}
                    sub={peer.user.isHost ? "Host" : "Attendee"}
                    avatarUrl={peer.user.avatarUrl}
                  />
                ))}
              </div>
            ) : (
              <>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {messages.length === 0 ? (
                    <p className="text-center text-xs text-white/40">No messages yet. Say hello 👋</p>
                  ) : (
                    messages.map((m, i) => (
                      <div key={i} className={cn("text-sm", m.me && "text-right")}>
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
      <footer className="flex items-center justify-center gap-2 border-t border-white/10 px-4 py-4 sm:gap-3">
        <ControlButton on={micOn} onClick={toggleMic} label="mic" IconOn={Mic} IconOff={MicOff} />
        <ControlButton on={camOn} onClick={toggleCam} label="camera" IconOn={VideoIcon} IconOff={VideoOff} />
        <RoundButton active={sharing} onClick={toggleShare} label="Share screen">
          <MonitorUp className="size-5" />
        </RoundButton>
        <RoundButton active={panel === "chat"} onClick={() => setPanel(panel === "chat" ? null : "chat")} label="Chat">
          <MessageSquare className="size-5" />
        </RoundButton>
        <RoundButton active={panel === "people"} onClick={() => setPanel(panel === "people" ? null : "people")} label="Participants">
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
          onClick={leave}
          aria-label="Leave"
          className="ml-1 flex h-11 items-center gap-2 rounded-full bg-rose-600 px-5 font-medium text-white transition-colors hover:bg-rose-700"
        >
          <PhoneOff className="size-5" /> Leave
        </button>
      </footer>
    </div>
  );
}

function ControlButton({
  on,
  onClick,
  label,
  IconOn,
  IconOff,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  IconOn: typeof Mic;
  IconOff: typeof Mic;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${on ? "Turn off" : "Turn on"} ${label}`}
      aria-pressed={!on}
      className={cn(
        "grid size-11 place-items-center rounded-full transition-colors",
        on ? "bg-white/10 text-white hover:bg-white/20" : "bg-rose-600 text-white hover:bg-rose-700",
      )}
    >
      {on ? <IconOn className="size-5" /> : <IconOff className="size-5" />}
    </button>
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
