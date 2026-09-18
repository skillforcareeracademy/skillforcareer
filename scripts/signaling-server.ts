import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";
import { verifyRoomToken } from "../src/lib/live/room-token";

/**
 * Standalone WebRTC signaling + realtime chat server for live classes.
 * Runs as its own process (keeps the Next.js dev server untouched).
 *
 *   npm run signal   →   listens on :4001
 *
 * Auth: the room page mints a short-lived room token (see room-token.ts) which
 * the client sends in the socket handshake; we verify it here with the same
 * secret. The server only relays SDP/ICE between peers (mesh) — media never
 * touches it — and records attendance in the DB on join/leave.
 *
 * It also carries the small facts a mesh has no other way to learn: who is
 * muted, whose camera is off, who is speaking, and when the host ends the
 * class. Those ride the socket because there is no server in the media path to
 * observe them.
 */
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

// Hosts (Render, Koyeb, Fly…) inject the port to bind as `PORT`; SIGNAL_PORT is
// the local override.
const PORT = Number(process.env.PORT || process.env.SIGNAL_PORT) || 4001;

// Browsers send an Origin header on the socket handshake, so every domain the
// app is served from must be listed. ALLOWED_ORIGINS takes a comma-separated
// list (production domain + any preview domains); localhost is always allowed.
const ALLOWED = [
  ...new Set(
    [
      ...(process.env.ALLOWED_ORIGINS ?? "").split(","),
      process.env.APP_URL,
      process.env.NEXT_PUBLIC_APP_URL,
      "http://localhost:3000",
      // `next dev --experimental-https` serves the app over TLS, and the socket
      // handshake then carries the https origin.
      "https://localhost:3000",
    ]
      // Browsers send Origin with no trailing slash ("https://x.app"), so strip
      // one if it's configured as a URL ("https://x.app/") — otherwise the
      // string comparison fails and every handshake is rejected.
      .map((o) => o?.trim().replace(/\/+$/, ""))
      .filter((o): o is string => Boolean(o)),
  ),
];

interface RoomUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  isHost: boolean;
}

/** What a tile needs to draw a peer it cannot inspect directly. */
interface PeerState {
  micOn: boolean;
  camOn: boolean;
  sharing: boolean;
  speaking: boolean;
  /** Video deliberately withheld because the room is over its mesh limit. */
  videoHeld: boolean;
}

const DEFAULT_STATE: PeerState = {
  micOn: true,
  camOn: true,
  sharing: false,
  speaking: false,
  videoHeld: false,
};

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  path: "/socket.io",
  cors: { origin: ALLOWED, methods: ["GET", "POST"] },
  // A learner who walks out of Wi-Fi range should drop off everyone else's
  // screen in about fifteen seconds, not the default twenty-five: the tiles of
  // people who have actually gone are what make a class look broken.
  pingInterval: 5_000,
  pingTimeout: 10_000,
});

/**
 * Who is in each room, keyed by user rather than by socket.
 *
 * One person can hold more than one socket — a phone that lost Wi-Fi reconnects
 * before the server has noticed the old socket is gone, and someone may simply
 * open the link twice. Attendance is per person, so the first socket opens the
 * register entry and only the last one to leave closes it. Without this every
 * network blip wrote another "present" row for the same learner.
 */
interface Member {
  userId: string;
  meetingId?: string;
  attendanceId?: string;
  joinedAt: Date;
  sockets: Set<string>;
}
const rooms = new Map<string, Map<string, Member>>();

function memberFor(roomCode: string, userId: string): Member | undefined {
  return rooms.get(roomCode)?.get(userId);
}

// Verify the room token on connect; stash identity on the socket.
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  const claims = token ? await verifyRoomToken(token) : null;
  if (!claims) return next(new Error("unauthorized"));
  socket.data.roomCode = claims.roomCode;
  socket.data.user = {
    id: claims.sub,
    name: claims.name,
    avatarUrl: claims.avatarUrl,
    isHost: claims.isHost,
  } satisfies RoomUser;
  socket.data.state = { ...DEFAULT_STATE };
  next();
});

io.on("connection", (socket) => {
  const roomCode: string = socket.data.roomCode;
  const user: RoomUser = socket.data.user;

  socket.join(roomCode);

  let members = rooms.get(roomCode);
  if (!members) {
    members = new Map();
    rooms.set(roomCode, members);
  }

  // Two live tabs of the same person means two copies of their microphone in
  // the room, which is where classroom echo comes from. The newest tab wins and
  // the older one is told why it was closed.
  const existing = members.get(user.id);
  const staleSockets = existing ? [...existing.sockets] : [];

  const member: Member = existing ?? {
    userId: user.id,
    joinedAt: new Date(),
    sockets: new Set(),
  };
  const isFirstSocket = member.sockets.size === 0;
  member.sockets.add(socket.id);
  members.set(user.id, member);

  for (const id of staleSockets) {
    io.to(id).emit("session-elsewhere");
    io.sockets.sockets.get(id)?.disconnect(true);
  }

  // Record attendance (best-effort — never break the call on a DB hiccup).
  // Only the person's first socket does this; a reconnect reuses the row.
  if (isFirstSocket) {
    void (async () => {
      try {
        const meeting = await prisma.meeting.findUnique({
          where: { roomCode },
          select: { id: true, batchId: true },
        });
        if (!meeting) return;
        member.meetingId = meeting.id;
        const now = member.joinedAt;
        await prisma.meetingParticipant.upsert({
          where: { meetingId_userId: { meetingId: meeting.id, userId: user.id } },
          create: {
            meetingId: meeting.id,
            userId: user.id,
            role: user.isHost ? "HOST" : "ATTENDEE",
            joinedAt: now,
          },
          update: { joinedAt: now, leftAt: null },
        });
        // If this process restarted mid-class, an earlier row may still be
        // open. Reuse it rather than marking the learner present twice.
        const open = await prisma.attendance.findFirst({
          where: { userId: user.id, meetingId: meeting.id, leftAt: null },
          select: { id: true },
          orderBy: { joinedAt: "desc" },
        });
        member.attendanceId =
          open?.id ??
          (
            await prisma.attendance.create({
              data: {
                userId: user.id,
                meetingId: meeting.id,
                batchId: meeting.batchId,
                status: "PRESENT",
                joinedAt: now,
              },
              select: { id: true },
            })
          ).id;
      } catch (e) {
        console.error("[signal] attendance error:", (e as Error).message);
      }
    })();
  }

  // Tell the newcomer who's already here, with each peer's current mic/camera
  // state so their tile is drawn correctly on the very first frame.
  void (async () => {
    const others = await io.in(roomCode).fetchSockets();
    const peers = others
      .filter((s) => s.id !== socket.id)
      .map((s) => ({
        socketId: s.id,
        user: s.data.user as RoomUser,
        state: (s.data.state as PeerState) ?? DEFAULT_STATE,
      }));
    socket.emit("peers", peers);
  })();

  // Announce the newcomer to existing peers.
  socket.to(roomCode).emit("peer-joined", {
    socketId: socket.id,
    user,
    state: socket.data.state as PeerState,
  });

  /** A socket may only be addressed by someone in the same room. */
  function sameRoom(targetId: string): Socket | undefined {
    const target = io.sockets.sockets.get(targetId);
    return target && target.data.roomCode === roomCode ? target : undefined;
  }

  // Relay SDP offers/answers and ICE candidates to a specific peer.
  socket.on("signal", ({ to, description, candidate }) => {
    sameRoom(String(to))?.emit("signal", {
      from: socket.id,
      description,
      candidate,
    });
  });

  // Mic / camera / screen-share / speaking. Nothing here is trusted for
  // anything but drawing a tile, so it is merged and fanned out as-is.
  // The client's liveness probe: an ack is all it needs, and an ack is all it
  // gets — a dropped link never reaches this handler, which is the point.
  socket.on("heartbeat", (ack?: () => void) => {
    if (typeof ack === "function") ack();
  });

  socket.on("state", (patch: Partial<PeerState>) => {
    const next: PeerState = {
      ...(socket.data.state as PeerState),
      ...(typeof patch?.micOn === "boolean" ? { micOn: patch.micOn } : {}),
      ...(typeof patch?.camOn === "boolean" ? { camOn: patch.camOn } : {}),
      ...(typeof patch?.sharing === "boolean" ? { sharing: patch.sharing } : {}),
      ...(typeof patch?.speaking === "boolean" ? { speaking: patch.speaking } : {}),
      ...(typeof patch?.videoHeld === "boolean" ? { videoHeld: patch.videoHeld } : {}),
    };
    socket.data.state = next;
    socket.to(roomCode).emit("peer-state", { socketId: socket.id, state: next });
  });

  // Broadcast chat to everyone else in the room.
  socket.on("chat", ({ text }: { text: string }) => {
    const clean = String(text ?? "").slice(0, 2000).trim();
    if (!clean) return;
    socket.to(roomCode).emit("chat", {
      id: `${socket.id}-${Date.now()}`,
      userId: user.id,
      name: user.name,
      text: clean,
    });
  });

  // Only the host may end the class, and everyone is told rather than being
  // left staring at a room that has quietly emptied.
  socket.on("end-class", () => {
    if (!user.isHost) return;
    io.in(roomCode).emit("class-ended", { by: user.name });
  });

  socket.on("disconnect", async () => {
    socket.to(roomCode).emit("peer-left", { socketId: socket.id });

    const current = memberFor(roomCode, user.id);
    if (!current || !current.sockets.has(socket.id)) return;
    current.sockets.delete(socket.id);
    // Another tab or a reconnected socket is still in the room — the person has
    // not left, so the register stays open.
    if (current.sockets.size > 0) return;

    const roomMembers = rooms.get(roomCode);
    roomMembers?.delete(user.id);
    if (roomMembers && roomMembers.size === 0) rooms.delete(roomCode);

    const left = new Date();
    const duration = Math.max(
      0,
      Math.round((left.getTime() - current.joinedAt.getTime()) / 1000),
    );
    try {
      if (current.attendanceId) {
        await prisma.attendance.update({
          where: { id: current.attendanceId },
          data: { leftAt: left, durationSeconds: duration },
        });
      }
      if (current.meetingId) {
        await prisma.meetingParticipant.updateMany({
          where: { meetingId: current.meetingId, userId: user.id },
          data: { leftAt: left, durationSeconds: duration },
        });
      }
    } catch (e) {
      console.error("[signal] leave error:", (e as Error).message);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`[signal] live signaling server on :${PORT} (origins: ${ALLOWED.join(", ")})`);
});
