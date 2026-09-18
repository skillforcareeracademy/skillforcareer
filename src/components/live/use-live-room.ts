"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

/**
 * The engine behind a live class: local camera/mic, and one peer connection per
 * other participant.
 *
 * Everything here exists because a mesh has no server in the media path. Nobody
 * can tell us that a learner muted themselves, that their laptop went to sleep,
 * or that the Wi-Fi dropped for four seconds — the room has to work all of that
 * out itself and keep drawing something truthful on screen while it does.
 *
 * The three pieces that make the difference between "a call" and "a call that
 * survives a real classroom":
 *
 *   • Perfect negotiation. Two people who join in the same second both try to
 *     offer, and without a rule for who backs down one of the two connections
 *     dies silently. One side is "polite" (decided by comparing socket ids, so
 *     both sides reach the same answer) and rolls back its own offer.
 *
 *   • Up-front transceivers. A sender for audio and one for video exist from
 *     the moment the connection is created, whether or not there is a track to
 *     put in them. A camera that is switched on later, or a screen share
 *     started with the camera off, is then a `replaceTrack` away — no second
 *     round of SDP, nothing to go wrong mid-class.
 *
 *   • Recovery. Connection state is watched per peer; a drop gets a moment to
 *     heal itself, then an ICE restart with backoff, then a full rebuild. If
 *     the signaling socket itself reconnects the room re-joins from scratch,
 *     because every socket id in the room has just changed.
 */

export interface RoomUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  isHost: boolean;
}

/** Facts about a peer that only the peer itself can know. Relayed over the socket. */
export interface PeerState {
  micOn: boolean;
  camOn: boolean;
  sharing: boolean;
  speaking: boolean;
  /** Video withheld on purpose because the room is over its mesh limit. */
  videoHeld: boolean;
}

export type PeerStatus = "connecting" | "connected" | "reconnecting" | "failed";

export interface PeerView {
  socketId: string;
  user: RoomUser;
  state: PeerState;
  status: PeerStatus;
  stream: MediaStream | null;
  /** A remote video track that is actually producing pictures right now. */
  hasVideo: boolean;
}

export type MediaStatus =
  | "starting"
  /** Camera and microphone both working. */
  | "ready"
  /** Microphone only — the camera was refused, missing or busy. */
  | "audio-only"
  /** Permission denied. Recoverable: the learner can allow and retry. */
  | "blocked"
  /** Neither device available. The learner can still watch and listen. */
  | "none";

export interface DeviceOption {
  deviceId: string;
  label: string;
}

export interface ChatMessage {
  id: string;
  from: string;
  text: string;
  me: boolean;
}

const DEFAULT_PEER_STATE: PeerState = {
  micOn: true,
  camOn: true,
  sharing: false,
  speaking: false,
  videoHeld: false,
};

/** Fallback if /api/live/ice can't be reached — a room on a friendly network still works. */
const FALLBACK_ICE: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

/** A "disconnected" peer usually heals itself; spend an ICE restart only if it doesn't. */
const HEAL_GRACE_MS = 2_500;
/** ICE restarts before we give up on the connection and build a new one. */
const REBUILD_AFTER_RESTARTS = 3;
/** Total attempts before a tile is honestly labelled as failed. */
const MAX_RESTARTS = 6;
/** Keep sending video for this long after someone stops talking, so it doesn't flicker. */
const SPEAKER_HOLD_MS = 6_000;

const CAMERA_KEY = "sfc.live.cameraId";
const MIC_KEY = "sfc.live.micId";

function readStored(key: string): string | undefined {
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}
function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private browsing — the choice just won't be remembered */
  }
}

/** Turn a getUserMedia rejection into something a learner can act on. */
function mediaMessageFor(error: unknown, wanted: "camera and microphone" | "camera"): string {
  const name = (error as DOMException | undefined)?.name ?? "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return `Your browser is blocking the ${wanted}. Open the padlock in the address bar, allow them, then tap Retry.`;
    case "NotFoundError":
    case "OverconstrainedError":
      return `No ${wanted} found on this device.`;
    case "NotSupportedError":
      return `This browser isn't allowed to use a ${wanted} on this page. Live classes need an https address and a recent Chrome, Edge, Safari or Firefox.`;
    case "NotReadableError":
    case "AbortError":
      return `Another app is using your ${wanted}. Close it — Zoom, Meet, or another tab — then tap Retry.`;
    default:
      // Naming the browser's own error is worth the jargon: it is the only
      // thing that tells a learner on the phone and the office on the other end
      // whether to look at permissions, a busy app, or the device itself.
      return `We couldn't start your ${wanted}${name ? ` — the browser reported ${name}` : ""}.`;
  }
}

interface PeerRecord {
  socketId: string;
  user: RoomUser;
  state: PeerState;
  status: PeerStatus;
  stream: MediaStream | null;
  pc: RTCPeerConnection;
  audioSender: RTCRtpSender | null;
  videoSender: RTCRtpSender | null;
  /** The side that yields when both offer at once. Decided identically on both ends. */
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  settingRemoteAnswer: boolean;
  /** Set while a connection created to answer an offer is still doing so. */
  suppressNegotiation: boolean;
  pendingIce: RTCIceCandidateInit[];
  /** Signal handling is serialised per peer — SDP state machines hate races. */
  queue: Promise<void>;
  restarts: number;
  restartTimer: ReturnType<typeof setTimeout> | null;
  healTimer: ReturnType<typeof setTimeout> | null;
  kickTimer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
}

export interface LiveRoomOptions {
  signalUrl: string;
  token: string;
  /** Whether to be in the room. False keeps the camera preview but connects nothing. */
  joined: boolean;
  selfName: string;
  isHost: boolean;
}

export function useLiveRoom({ signalUrl, token, joined, selfName, isHost }: LiveRoomOptions) {
  // ── Local media ────────────────────────────────────────────────────────────
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [mediaStatus, setMediaStatus] = useState<MediaStatus>("starting");
  const [mediaMessage, setMediaMessage] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [cameras, setCameras] = useState<DeviceOption[]>([]);
  const [microphones, setMicrophones] = useState<DeviceOption[]>([]);
  const [cameraId, setCameraId] = useState<string | undefined>(undefined);
  const [micId, setMicId] = useState<string | undefined>(undefined);

  // ── Room ───────────────────────────────────────────────────────────────────
  const [peers, setPeers] = useState<PeerView[]>([]);
  const [socketConnected, setSocketConnected] = useState(false);
  const [signalError, setSignalError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [meshLimit, setMeshLimit] = useState(6);
  const [hasTurn, setHasTurn] = useState(false);
  const [videoHeld, setVideoHeld] = useState(false);
  const [endedBy, setEndedBy] = useState<string | null>(null);
  const [sessionElsewhere, setSessionElsewhere] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerRecord>>(new Map());
  const socketRef = useRef<Socket | null>(null);
  /** False once the link is known to be dead, before the socket admits it. */
  const linkAliveRef = useRef(false);
  const socketIdRef = useRef<string | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>(FALLBACK_ICE);
  const selfStateRef = useRef<PeerState>({ ...DEFAULT_PEER_STATE });
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastSpokeRef = useRef(0);
  const sendingVideoRef = useRef(true);
  const peerCountRef = useRef(0);
  const meshLimitRef = useRef(6);

  const sync = useCallback(() => {
    const next = [...peersRef.current.values()].map((r) => ({
      socketId: r.socketId,
      user: r.user,
      state: r.state,
      status: r.status,
      stream: r.stream,
      hasVideo: Boolean(
        r.stream?.getVideoTracks().some((t) => t.readyState === "live" && !t.muted),
      ),
    }));
    peerCountRef.current = next.length;
    setPeers(next);
  }, []);

  // ── Local media: acquire, fall back, re-try ────────────────────────────────

  const stopAudioMeter = useCallback(() => {
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  /**
   * Cheap "is this person talking" check, so a tile can light up and — in a big
   * room — so the speaker's video is the one that gets through.
   */
  const startAudioMeter = useCallback((stream: MediaStream) => {
    stopAudioMeter();
    if (stream.getAudioTracks().length === 0) return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      return;
    }
    audioCtxRef.current = ctx;
    void ctx.resume().catch(() => {});
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);
    const buffer = new Uint8Array(analyser.frequencyBinCount);
    let talking = false;

    const tick = () => {
      if (audioCtxRef.current !== ctx) return;
      analyser.getByteFrequencyData(buffer);
      let sum = 0;
      for (const v of buffer) sum += v * v;
      const level = Math.sqrt(sum / buffer.length) / 255;
      const live = level > 0.045 && stream.getAudioTracks().some((t) => t.enabled);
      if (live) lastSpokeRef.current = Date.now();
      if (live !== talking) {
        talking = live;
        setSpeaking(live);
        socketRef.current?.emit("state", { speaking: live });
        selfStateRef.current = { ...selfStateRef.current, speaking: live };
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [stopAudioMeter]);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const pick = (kind: MediaDeviceKind, fallback: string) =>
        list
          .filter((d) => d.kind === kind && d.deviceId)
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${fallback} ${i + 1}` }));
      setCameras(pick("videoinput", "Camera"));
      setMicrophones(pick("audioinput", "Microphone"));
    } catch {
      /* label enumeration is a nicety, never a blocker */
    }
  }, []);

  /** Hand a new local track to every peer without renegotiating. */
  const publishTrack = useCallback((kind: "audio" | "video", track: MediaStreamTrack | null) => {
    peersRef.current.forEach((rec) => {
      const sender = kind === "audio" ? rec.audioSender : rec.videoSender;
      sender?.replaceTrack(track).catch(() => {});
    });
  }, []);

  const acquire = useCallback(
    async (opts?: { cameraId?: string; micId?: string }) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMediaStatus("none");
        setMediaMessage(
          "This browser can't reach a camera or microphone. Live classes need a recent Chrome, Edge, Safari or Firefox over https.",
        );
        return;
      }
      const wantCamera = opts?.cameraId ?? readStored(CAMERA_KEY);
      const wantMic = opts?.micId ?? readStored(MIC_KEY);
      const video: MediaTrackConstraints = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        ...(wantCamera ? { deviceId: { ideal: wantCamera } } : {}),
      };
      const audio: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(wantMic ? { deviceId: { ideal: wantMic } } : {}),
      };

      setMediaStatus("starting");
      let stream: MediaStream | null = null;
      let status: MediaStatus = "ready";
      let message: string | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio });
      } catch (error) {
        // A missing or busy camera must not cost the learner their voice too.
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio });
          status = "audio-only";
          message = `${mediaMessageFor(error, "camera")} You've joined with audio only.`;
        } catch (audioError) {
          status = (audioError as DOMException)?.name === "NotAllowedError" ? "blocked" : "none";
          message = `${mediaMessageFor(audioError, "camera and microphone")} You can still see and hear everyone else.`;
        }
      }

      const previous = localStreamRef.current;
      localStreamRef.current = stream;
      setLocalStream(stream);
      setMediaStatus(status);
      setMediaMessage(message);

      if (stream) {
        const audioTrack = stream.getAudioTracks()[0] ?? null;
        const videoTrack = stream.getVideoTracks()[0] ?? null;
        // Honour the toggles the learner set in the lobby before this stream existed.
        if (audioTrack) audioTrack.enabled = micOn;
        if (videoTrack) videoTrack.enabled = camOn;
        setCameraId(videoTrack?.getSettings().deviceId);
        setMicId(audioTrack?.getSettings().deviceId);
        publishTrack("audio", audioTrack);
        if (!screenStreamRef.current) publishTrack("video", videoTrack);
        startAudioMeter(stream);
        void refreshDevices();
      }
      // Only stop the old devices once the new ones are live, so the tile never
      // goes black in between.
      previous?.getTracks().forEach((t) => t.stop());
    },
    [camOn, micOn, publishTrack, refreshDevices, startAudioMeter],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await acquire();
      if (cancelled) return;
    })();
    const onDeviceChange = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChange);
    };
    // Runs once: re-acquiring is an explicit action (Retry, or picking a device).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Release the devices when the room is torn down, however that happens.
  useEffect(
    () => () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    },
    [],
  );

  // ── The mesh ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!joined) return;
    let disposed = false;
    // The map itself is never replaced, only its contents, so holding the
    // reference is safe and keeps the cleanup honest about what it tears down.
    const livePeers = peersRef.current;

    const closePeer = (rec: PeerRecord) => {
      rec.closed = true;
      if (rec.restartTimer) clearTimeout(rec.restartTimer);
      if (rec.healTimer) clearTimeout(rec.healTimer);
      if (rec.kickTimer) clearTimeout(rec.kickTimer);
      rec.pc.onicecandidate = null;
      rec.pc.ontrack = null;
      rec.pc.onnegotiationneeded = null;
      rec.pc.onconnectionstatechange = null;
      rec.pc.oniceconnectionstatechange = null;
      try {
        rec.pc.close();
      } catch {
        /* already gone */
      }
    };

    const dropPeer = (socketId: string) => {
      const rec = peersRef.current.get(socketId);
      if (!rec) return;
      closePeer(rec);
      peersRef.current.delete(socketId);
      sync();
    };

    const closeAll = () => {
      peersRef.current.forEach(closePeer);
      peersRef.current.clear();
      sync();
    };

    /**
     * Video is the expensive half of a mesh: every participant uploads a copy to
     * every other one. Past the room's limit we keep audio for everybody — a
     * class you can hear is still a class — and let only the host and whoever is
     * speaking send pictures.
     */
    const applyVideoBudget = () => {
      const overLimit = peerCountRef.current + 1 > meshLimitRef.current;
      const recentlySpoke = Date.now() - lastSpokeRef.current < SPEAKER_HOLD_MS;
      const send = !overLimit || isHost || recentlySpoke || screenStreamRef.current !== null;
      if (send === sendingVideoRef.current) return;
      sendingVideoRef.current = send;
      setVideoHeld(!send);
      const track = screenStreamRef.current
        ? screenStreamRef.current.getVideoTracks()[0]
        : localStreamRef.current?.getVideoTracks()[0];
      publishTrack("video", send ? (track ?? null) : null);
      selfStateRef.current = { ...selfStateRef.current, videoHeld: !send };
      socketRef.current?.emit("state", { videoHeld: !send });
    };
    const budgetTimer = setInterval(applyVideoBudget, 1_000);

    /** Put whatever we are sending right now into a peer's two senders. */
    const attachLocalTracks = (rec: PeerRecord) => {
      const localAudio = localStreamRef.current?.getAudioTracks()[0] ?? null;
      const localVideo = screenStreamRef.current
        ? (screenStreamRef.current.getVideoTracks()[0] ?? null)
        : (localStreamRef.current?.getVideoTracks()[0] ?? null);
      rec.audioSender?.replaceTrack(localAudio).catch(() => {});
      rec.videoSender
        ?.replaceTrack(sendingVideoRef.current ? localVideo : null)
        .catch(() => {});
    };

    /**
     * The answering side's senders: the transceivers arrived with the offer, so
     * take them rather than adding a second pair. Called once the remote offer
     * is set, before the answer is built, so our own tracks are in it.
     */
    const adoptTransceivers = (rec: PeerRecord) => {
      if (rec.audioSender && rec.videoSender) return;
      for (const t of rec.pc.getTransceivers()) {
        const kind = t.receiver.track?.kind ?? t.sender.track?.kind;
        if (kind === "audio" && !rec.audioSender) rec.audioSender = t.sender;
        else if (kind === "video" && !rec.videoSender) rec.videoSender = t.sender;
        else continue;
        if (t.direction !== "sendrecv") t.direction = "sendrecv";
      }
      attachLocalTracks(rec);
    };

    const createPeer = (
      socketId: string,
      user: RoomUser,
      state: PeerState,
      answering: boolean,
    ): PeerRecord => {
      const pc = new RTCPeerConnection({
        iceServers: iceServersRef.current,
        bundlePolicy: "max-bundle",
      });
      const mySocketId = socketIdRef.current ?? "";
      const rec: PeerRecord = {
        socketId,
        user,
        state,
        status: "connecting",
        stream: null,
        pc,
        audioSender: null,
        videoSender: null,
        // Any rule works as long as both ends agree; comparing socket ids needs
        // no extra round trip and can't disagree.
        polite: mySocketId > socketId,
        makingOffer: false,
        ignoreOffer: false,
        settingRemoteAnswer: false,
        suppressNegotiation: answering,
        pendingIce: [],
        queue: Promise.resolve(),
        restarts: 0,
        restartTimer: null,
        healTimer: null,
        kickTimer: null,
        closed: false,
      };

      // One audio and one video transceiver, in this order — created by the
      // side that offers, and *only* by that side. The answerer adopts the
      // transceivers the offer brings (adoptTransceivers below) instead of
      // adding its own: when both ends added their own the session carried four
      // m-lines, so every tile received two audio and two video tracks, half of
      // them inactive placeholders. The <video> bound to a placeholder and
      // showed nothing while the real frames arrived on the other track.
      //
      // Fixing the layout up front is what lets a track be dropped in later
      // without renegotiating — which is what makes screen sharing work with the
      // camera off, and what lets someone who joined with no camera turn one on
      // mid-class.
      if (!answering) {
        rec.audioSender = pc.addTransceiver("audio", { direction: "sendrecv" }).sender;
        rec.videoSender = pc.addTransceiver("video", { direction: "sendrecv" }).sender;
        attachLocalTracks(rec);
      }

      pc.onicecandidate = (e) => {
        if (e.candidate) socketRef.current?.emit("signal", { to: socketId, candidate: e.candidate });
      };

      pc.ontrack = () => {
        // Built from the receivers rather than `event.streams`: tracks put into
        // a transceiver with replaceTrack carry no stream id, so the browser has
        // none to hand us. A fresh MediaStream each time also guarantees the
        // <video> element re-binds.
        const tracks = pc
          .getReceivers()
          .map((r) => r.track)
          .filter((t): t is MediaStreamTrack => Boolean(t) && t.readyState !== "ended");
        rec.stream = tracks.length > 0 ? new MediaStream(tracks) : null;
        tracks.forEach((t) => {
          t.onmute = sync;
          t.onunmute = sync;
          t.onended = sync;
        });
        sync();
      };

      const negotiate = () => {
        rec.queue = rec.queue
          .then(async () => {
            if (rec.closed || disposed || rec.suppressNegotiation) return;
            try {
              rec.makingOffer = true;
              await pc.setLocalDescription();
              socketRef.current?.emit("signal", { to: socketId, description: pc.localDescription });
            } finally {
              rec.makingOffer = false;
            }
          })
          .catch(() => {});
      };
      pc.onnegotiationneeded = negotiate;

      if (answering) {
        // We are holding back because the other side said it would offer. If it
        // never does — a tab that froze on the way in — offer ourselves rather
        // than leave a tile blank for the rest of the class.
        rec.kickTimer = setTimeout(() => {
          rec.kickTimer = null;
          if (rec.closed || disposed) return;
          if (pc.connectionState !== "new" || pc.signalingState !== "stable") return;
          rec.suppressNegotiation = false;
          negotiate();
        }, 8_000);
      }

      const setStatus = (status: PeerStatus) => {
        if (rec.status === status) return;
        rec.status = status;
        sync();
      };

      /**
       * Get a broken connection back. An ICE restart re-gathers candidates on a
       * live connection — usually all a changed network needs. The impolite side
       * goes first and the polite side waits, so the two don't restart on top of
       * each other; if the impolite side is the one that vanished, the polite
       * side still gets its turn.
       */
      const tryRecover = () => {
        if (rec.closed || disposed || rec.restartTimer) return;
        if (rec.restarts >= MAX_RESTARTS) {
          setStatus("failed");
          return;
        }
        const attempt = rec.restarts++;
        const base = rec.polite ? 3_000 : 400;
        const delay = Math.min(15_000, base * 2 ** attempt) + Math.random() * 400;
        rec.restartTimer = setTimeout(() => {
          rec.restartTimer = null;
          if (rec.closed || disposed) return;
          if (pc.connectionState === "connected") return;
          if (attempt >= REBUILD_AFTER_RESTARTS) {
            // Restarts aren't getting there. Throw the connection away and build
            // a fresh one, telling the far end to do the same.
            socketRef.current?.emit("signal", { to: socketId, reset: true });
            const { user: u, state: s } = rec;
            dropPeer(socketId);
            const fresh = createPeer(socketId, u, s, false);
            peersRef.current.set(socketId, fresh);
            sync();
            return;
          }
          try {
            pc.restartIce();
          } catch {
            /* browser refused — the next attempt rebuilds instead */
          }
          tryRecover();
        }, delay);
      };

      pc.onconnectionstatechange = () => {
        switch (pc.connectionState) {
          case "connected":
            rec.restarts = 0;
            if (rec.restartTimer) clearTimeout(rec.restartTimer);
            if (rec.healTimer) clearTimeout(rec.healTimer);
            rec.restartTimer = null;
            rec.healTimer = null;
            setStatus("connected");
            break;
          case "disconnected":
            setStatus("reconnecting");
            // Short blips fix themselves; don't spend a restart on a hiccup.
            if (!rec.healTimer) {
              rec.healTimer = setTimeout(() => {
                rec.healTimer = null;
                if (pc.connectionState === "disconnected") tryRecover();
              }, HEAL_GRACE_MS);
            }
            break;
          case "failed":
            setStatus("reconnecting");
            tryRecover();
            break;
          case "closed":
            break;
          default:
            if (rec.status !== "reconnecting") setStatus("connecting");
        }
      };

      // Firefox still reports the useful detail on the ICE transport rather than
      // the connection, so watch both.
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed") tryRecover();
      };

      peersRef.current.set(socketId, rec);
      return rec;
    };

    const ensurePeer = (
      socketId: string,
      user: RoomUser,
      state: PeerState,
      answering: boolean,
    ): PeerRecord => {
      const existing = peersRef.current.get(socketId);
      if (existing) return existing;
      const rec = createPeer(socketId, user, state, answering);
      sync();
      return rec;
    };

    /** Teardown for listeners added once the socket exists. */
    const cleanups: (() => void)[] = [];
    linkAliveRef.current = true;

    const flushIce = async (rec: PeerRecord) => {
      const queued = rec.pendingIce;
      rec.pendingIce = [];
      for (const candidate of queued) {
        await rec.pc.addIceCandidate(candidate).catch(() => {});
      }
    };

    void (async () => {
      // ICE first: a peer connection built with the wrong servers is a peer
      // connection that never connects, and re-creating it later costs seconds.
      try {
        const res = await fetch("/api/live/ice", { cache: "no-store" });
        const json = await res.json();
        if (json?.success && Array.isArray(json.data?.iceServers)) {
          iceServersRef.current = json.data.iceServers;
          setHasTurn(Boolean(json.data.hasTurn));
          if (json.data.meshLimit) {
            meshLimitRef.current = json.data.meshLimit;
            setMeshLimit(json.data.meshLimit);
          }
        }
      } catch {
        // Keep the public STUN fallback; a room on a friendly network still works.
      }
      if (disposed) return;

      const socket = io(signalUrl, {
        auth: { token },
        path: "/socket.io",
        // Order matters: WebSocket is what we want, but some campus and office
        // proxies drop it outright. `tryAllTransports` is what makes the client
        // fall back to long-polling instead of simply failing to connect.
        transports: ["websocket", "polling"],
        tryAllTransports: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 500,
        reconnectionDelayMax: 5_000,
        randomizationFactor: 0.5,
        timeout: 10_000,
      });
      socketRef.current = socket;

      const mine = () => socketRef.current === socket && !disposed;

      socket.on("connect", () => {
        if (!mine()) return;
        linkAliveRef.current = true;
        const previous = socketIdRef.current;
        socketIdRef.current = socket.id ?? null;
        setSocketConnected(true);
        setSignalError(null);
        // Every socket id in the room changed when ours did, so nothing we were
        // holding is addressable any more. Start the mesh again from the `peers`
        // snapshot the server is about to send.
        if (previous && previous !== socket.id) closeAll();
        socket.emit("state", selfStateRef.current);
      });

      // A phone that walks out of Wi-Fi range, or a laptop whose network is cut
      // mid-class, often leaves the socket believing it is fine: nothing is
      // received, so nothing fires. Ask for an answer every few seconds and
      // treat two missed answers as "we've lost the class server", which is what
      // the learner already suspects from the frozen tiles.
      let missedBeats = 0;
      const beat = setInterval(() => {
        if (!mine() || !socket.connected) return;
        socket.timeout(4_000).emit("heartbeat", (err: Error | null) => {
          if (!mine()) return;
          if (err) {
            missedBeats += 1;
            if (missedBeats >= 2) {
              linkAliveRef.current = false;
              setSocketConnected(false);
              setSignalError("Lost the class server. Trying to get back in…");
              peersRef.current.forEach((rec) => {
                if (rec.status === "connected") rec.status = "reconnecting";
              });
              sync();
            }
            return;
          }
          if (missedBeats > 0) {
            missedBeats = 0;
            linkAliveRef.current = true;
            setSocketConnected(true);
            setSignalError(null);
          }
        });
      }, 5_000);
      cleanups.push(() => clearInterval(beat));

      socket.on("disconnect", () => {
        if (!mine()) return;
        linkAliveRef.current = false;
        setSocketConnected(false);
        peersRef.current.forEach((rec) => {
          if (rec.status === "connected") rec.status = "reconnecting";
        });
        sync();
      });

      // The browser knows the network has gone before the socket's ping timeout
      // does — about ten seconds earlier on a cut Wi-Fi. Say so straight away,
      // rather than leaving a room that looks connected but isn't.
      const onOffline = () => {
        if (!mine()) return;
        setSocketConnected(false);
        setSignalError("You're offline. Waiting for the network to come back…");
        peersRef.current.forEach((rec) => {
          if (rec.status === "connected") rec.status = "reconnecting";
        });
        sync();
      };
      const onOnline = () => {
        if (!mine()) return;
        setSignalError(null);
        // Socket.io reconnects on its own; this only shortens the wait.
        if (!socket.connected) socket.connect();
      };
      window.addEventListener("offline", onOffline);
      window.addEventListener("online", onOnline);
      cleanups.push(() => {
        window.removeEventListener("offline", onOffline);
        window.removeEventListener("online", onOnline);
      });

      socket.on("connect_error", (err: Error) => {
        if (!mine()) return;
        setSocketConnected(false);
        setSignalError(
          err.message === "unauthorized"
            ? "This room link has expired. Reload the page to join again."
            : "Can't reach the class server. Retrying…",
        );
      });

      socket.on(
        "peers",
        (list: { socketId: string; user: RoomUser; state?: PeerState }[]) => {
          if (!mine()) return;
          // Whoever walks in opens the connections; adding the transceivers
          // fires negotiationneeded, which sends the offer. This snapshot is
          // only ever additive — someone who joined a moment after it was taken
          // arrives by `peer-joined`, and leavers arrive by `peer-left`.
          list.forEach((p) =>
            ensurePeer(p.socketId, p.user, p.state ?? { ...DEFAULT_PEER_STATE }, false),
          );
          sync();
        },
      );

      socket.on(
        "peer-joined",
        ({ socketId, user, state }: { socketId: string; user: RoomUser; state?: PeerState }) => {
          if (!mine()) return;
          const rec = peersRef.current.get(socketId);
          if (rec) {
            rec.user = user;
            if (state) rec.state = state;
            sync();
            return;
          }
          // Hold a tile for them straight away so the room doesn't look empty
          // while the offer is in flight; the connection itself is theirs to open.
          const placeholder = createPeer(socketId, user, state ?? { ...DEFAULT_PEER_STATE }, true);
          placeholder.suppressNegotiation = true;
          sync();
        },
      );

      socket.on(
        "signal",
        ({
          from,
          description,
          candidate,
          reset,
        }: {
          from: string;
          description?: RTCSessionDescriptionInit;
          candidate?: RTCIceCandidateInit;
          reset?: boolean;
        }) => {
          if (!mine()) return;
          if (reset) {
            const old = peersRef.current.get(from);
            const user = old?.user ?? { id: "", name: "Guest", avatarUrl: null, isHost: false };
            const state = old?.state ?? { ...DEFAULT_PEER_STATE };
            dropPeer(from);
            ensurePeer(from, user, state, true).suppressNegotiation = true;
            return;
          }

          const rec = ensurePeer(
            from,
            { id: "", name: "Guest", avatarUrl: null, isHost: false },
            { ...DEFAULT_PEER_STATE },
            Boolean(description),
          );
          const pc = rec.pc;

          rec.queue = rec.queue
            .then(async () => {
              if (rec.closed || disposed) return;
              if (description) {
                // The perfect-negotiation dance. `readyForOffer` is the standard
                // test for "we are in a state where a remote offer is welcome".
                const readyForOffer =
                  !rec.makingOffer &&
                  (pc.signalingState === "stable" || rec.settingRemoteAnswer);
                const collision = description.type === "offer" && !readyForOffer;
                rec.ignoreOffer = !rec.polite && collision;
                if (rec.ignoreOffer) return;

                rec.settingRemoteAnswer = description.type === "answer";
                try {
                  await pc.setRemoteDescription(description);
                } finally {
                  rec.settingRemoteAnswer = false;
                }
                rec.suppressNegotiation = false;
                await flushIce(rec);
                if (description.type === "offer") {
                  adoptTransceivers(rec);
                  await pc.setLocalDescription();
                  socketRef.current?.emit("signal", {
                    to: from,
                    description: pc.localDescription,
                  });
                }
              } else if (candidate) {
                if (!pc.remoteDescription) {
                  rec.pendingIce.push(candidate);
                  return;
                }
                try {
                  await pc.addIceCandidate(candidate);
                } catch (err) {
                  // A candidate for an offer we deliberately ignored is expected.
                  if (!rec.ignoreOffer) throw err;
                }
              }
            })
            .catch(() => {
              /* one bad message must not wedge the peer's queue */
            });
        },
      );

      socket.on("peer-state", ({ socketId, state }: { socketId: string; state: PeerState }) => {
        if (!mine()) return;
        const rec = peersRef.current.get(socketId);
        if (!rec) return;
        rec.state = state;
        sync();
      });

      socket.on("peer-left", ({ socketId }: { socketId: string }) => {
        if (!mine()) return;
        dropPeer(socketId);
      });

      socket.on("chat", (msg: { id?: string; name: string; text: string }) => {
        if (!mine()) return;
        setMessages((m) => [
          ...m,
          { id: msg.id ?? `${Date.now()}`, from: msg.name, text: msg.text, me: false },
        ]);
      });

      socket.on("class-ended", ({ by }: { by: string }) => {
        if (!mine()) return;
        setEndedBy(by);
      });

      socket.on("session-elsewhere", () => {
        if (!mine()) return;
        setSessionElsewhere(true);
      });
    })();

    return () => {
      disposed = true;
      clearInterval(budgetTimer);
      cleanups.forEach((fn) => fn());
      cleanups.length = 0;
      socketRef.current?.disconnect();
      socketRef.current = null;
      socketIdRef.current = null;
      livePeers.forEach(closePeer);
      livePeers.clear();
      setPeers([]);
      setSocketConnected(false);
    };
  }, [joined, signalUrl, token, isHost, publishTrack, sync]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const toggleMic = useCallback(() => {
    const next = !micOn;
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
    selfStateRef.current = { ...selfStateRef.current, micOn: next };
    socketRef.current?.emit("state", { micOn: next });
  }, [micOn]);

  const toggleCam = useCallback(() => {
    const next = !camOn;
    localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
    setCamOn(next);
    selfStateRef.current = { ...selfStateRef.current, camOn: next };
    socketRef.current?.emit("state", { camOn: next });
  }, [camOn]);

  const stopSharing = useCallback(() => {
    const screen = screenStreamRef.current;
    screenStreamRef.current = null;
    setScreenStream(null);
    setSharing(false);
    // Put the camera back — it was never stopped, only set aside.
    publishTrack("video", localStreamRef.current?.getVideoTracks()[0] ?? null);
    screen?.getTracks().forEach((t) => t.stop());
    selfStateRef.current = { ...selfStateRef.current, sharing: false };
    socketRef.current?.emit("state", { sharing: false });
  }, [publishTrack]);

  const startSharing = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      return "Screen sharing isn't available in this browser. Chrome, Edge or Safari on a computer can do it.";
    }
    let screen: MediaStream;
    try {
      screen = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
      });
    } catch (error) {
      const name = (error as DOMException)?.name;
      if (name === "NotAllowedError") return null; // the picker was dismissed
      return "Screen sharing was refused by this device.";
    }
    const track = screen.getVideoTracks()[0];
    if (!track) return "That screen didn't produce a picture.";

    screenStreamRef.current = screen;
    setScreenStream(screen);
    setSharing(true);
    // A sender exists whether or not there is a camera, so this reaches everyone
    // even for someone who joined with their camera off or refused.
    publishTrack("video", track);
    selfStateRef.current = { ...selfStateRef.current, sharing: true };
    socketRef.current?.emit("state", { sharing: true });
    // The browser's own "Stop sharing" button ends the track behind our back.
    track.addEventListener("ended", () => stopSharing());
    return null;
  }, [publishTrack, stopSharing]);

  const toggleShare = useCallback(async () => {
    if (screenStreamRef.current) {
      stopSharing();
      return null;
    }
    return startSharing();
  }, [startSharing, stopSharing]);

  const selectCamera = useCallback(
    async (deviceId: string) => {
      try {
        const next = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        const track = next.getVideoTracks()[0];
        if (!track) return;
        track.enabled = camOn;
        const stream = localStreamRef.current;
        const old = stream?.getVideoTracks()[0];
        if (stream) {
          if (old) stream.removeTrack(old);
          stream.addTrack(track);
        } else {
          localStreamRef.current = next;
          setLocalStream(next);
        }
        if (!screenStreamRef.current) publishTrack("video", track);
        old?.stop();
        setCameraId(deviceId);
        store(CAMERA_KEY, deviceId);
        // A new track object needs a new stream identity for the tile to re-bind.
        if (stream) {
          const rebuilt = new MediaStream(stream.getTracks());
          localStreamRef.current = rebuilt;
          setLocalStream(rebuilt);
        }
      } catch {
        setMediaMessage("That camera couldn't be started. It may be in use by another app.");
      }
    },
    [camOn, publishTrack],
  );

  const selectMicrophone = useCallback(
    async (deviceId: string) => {
      try {
        const next = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true },
        });
        const track = next.getAudioTracks()[0];
        if (!track) return;
        track.enabled = micOn;
        const stream = localStreamRef.current;
        const old = stream?.getAudioTracks()[0];
        if (stream) {
          if (old) stream.removeTrack(old);
          stream.addTrack(track);
        } else {
          localStreamRef.current = next;
          setLocalStream(next);
        }
        publishTrack("audio", track);
        old?.stop();
        setMicId(deviceId);
        store(MIC_KEY, deviceId);
        if (localStreamRef.current) startAudioMeter(localStreamRef.current);
      } catch {
        setMediaMessage("That microphone couldn't be started.");
      }
    },
    [micOn, publishTrack, startAudioMeter],
  );

  const retryMedia = useCallback(async () => {
    await acquire();
  }, [acquire]);

  const sendChat = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      socketRef.current?.emit("chat", { text: clean });
      setMessages((m) => [
        ...m,
        { id: `me-${Date.now()}`, from: selfName, text: clean, me: true },
      ]);
    },
    [selfName],
  );

  const endClass = useCallback(() => {
    socketRef.current?.emit("end-class");
  }, []);

  const teardown = useCallback(() => {
    socketRef.current?.disconnect();
    peersRef.current.forEach((rec) => rec.pc.close());
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  // A read-only window onto the live connections. Support can ask a learner to
  // paste `__liveRoom.report()` from the console instead of guessing, and the
  // browser test harness reads the same numbers.
  useEffect(() => {
    const w = window as unknown as { __liveRoom?: unknown };
    w.__liveRoom = {
      report: () => ({
        socketId: socketIdRef.current,
        // Not the socket's own flag: a link cut at the network never fires
        // `disconnect`, so the socket keeps claiming it is connected while
        // nothing moves. This is what the room is actually showing.
        connected: (socketRef.current?.connected ?? false) && linkAliveRef.current,
        transport: socketRef.current?.io?.engine?.transport?.name ?? null,
        hasTurn,
        meshLimit: meshLimitRef.current,
        sendingVideo: sendingVideoRef.current,
        mediaStatus,
        localTracks: (localStreamRef.current?.getTracks() ?? []).map((t) => ({
          kind: t.kind,
          enabled: t.enabled,
          readyState: t.readyState,
        })),
        peers: [...peersRef.current.values()].map((r) => ({
          socketId: r.socketId,
          name: r.user.name,
          polite: r.polite,
          status: r.status,
          connectionState: r.pc.connectionState,
          iceConnectionState: r.pc.iceConnectionState,
          signalingState: r.pc.signalingState,
          restarts: r.restarts,
          state: r.state,
          remoteTracks: (r.stream?.getTracks() ?? []).map((t) => ({
            kind: t.kind,
            readyState: t.readyState,
            muted: t.muted,
          })),
          sending: {
            audio: r.audioSender?.track?.kind ?? null,
            video: r.videoSender?.track?.kind ?? null,
          },
        })),
      }),
      // The real numbers, straight from the browser. "It says connected but I
      // can't hear anything" is answered by bytesReceived, not by a screenshot.
      stats: async () => {
        const rows = [];
        for (const r of peersRef.current.values()) {
          const row: Record<string, unknown> = {
            socketId: r.socketId,
            name: r.user.name,
            connectionState: r.pc.connectionState,
          };
          const inbound: unknown[] = [];
          const outbound: unknown[] = [];
          const candidateTypes = new Set<string>();
          let roundTripMs: number | null = null;
          try {
            (await r.pc.getStats()).forEach((stat) => {
              const s = stat as unknown as Record<string, number | string>;
              if (s.type === "inbound-rtp") {
                inbound.push({
                  kind: s.kind,
                  bytesReceived: s.bytesReceived ?? 0,
                  packetsReceived: s.packetsReceived ?? 0,
                  framesDecoded: s.framesDecoded ?? 0,
                });
              } else if (s.type === "outbound-rtp") {
                outbound.push({ kind: s.kind, bytesSent: s.bytesSent ?? 0 });
              } else if (s.type === "candidate-pair" && s.state === "succeeded") {
                roundTripMs = Math.round(Number(s.currentRoundTripTime ?? 0) * 1000);
              } else if (s.type === "local-candidate" && typeof s.candidateType === "string") {
                candidateTypes.add(s.candidateType);
              }
            });
          } catch {
            /* the connection closed while we were asking */
          }
          rows.push({ ...row, inbound, outbound, roundTripMs, candidateTypes: [...candidateTypes] });
        }
        return rows;
      },
    };
    return () => {
      delete (window as unknown as { __liveRoom?: unknown }).__liveRoom;
    };
  }, [hasTurn, mediaStatus]);

  const participantCount = peers.length + 1;
  const overMeshLimit = participantCount > meshLimit;

  return useMemo(
    () => ({
      // media
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
      // room
      peers,
      socketConnected,
      signalError,
      messages,
      meshLimit,
      hasTurn,
      participantCount,
      overMeshLimit,
      videoHeld,
      endedBy,
      sessionElsewhere,
      // actions
      toggleMic,
      toggleCam,
      toggleShare,
      selectCamera,
      selectMicrophone,
      retryMedia,
      sendChat,
      endClass,
      teardown,
    }),
    [
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
      hasTurn,
      participantCount,
      overMeshLimit,
      videoHeld,
      endedBy,
      sessionElsewhere,
      toggleMic,
      toggleCam,
      toggleShare,
      selectCamera,
      selectMicrophone,
      retryMedia,
      sendChat,
      endClass,
      teardown,
    ],
  );
}
