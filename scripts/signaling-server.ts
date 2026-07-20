import { createServer } from "node:http";
import { Server } from "socket.io";
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
 */
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

const PORT = Number(process.env.SIGNAL_PORT) || 4001;
const ALLOWED = [
  process.env.APP_URL || "http://localhost:3000",
  "http://localhost:3000",
];

interface RoomUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  isHost: boolean;
}

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
});

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
  next();
});

io.on("connection", (socket) => {
  const roomCode: string = socket.data.roomCode;
  const user: RoomUser = socket.data.user;

  socket.join(roomCode);

  // Record attendance (best-effort — never break the call on a DB hiccup).
  void (async () => {
    try {
      const meeting = await prisma.meeting.findUnique({
        where: { roomCode },
        select: { id: true, batchId: true },
      });
      if (!meeting) return;
      socket.data.meetingId = meeting.id;
      const now = new Date();
      socket.data.joinedAt = now;
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
      const attendance = await prisma.attendance.create({
        data: {
          userId: user.id,
          meetingId: meeting.id,
          batchId: meeting.batchId,
          status: "PRESENT",
          joinedAt: now,
        },
        select: { id: true },
      });
      socket.data.attendanceId = attendance.id;
    } catch (e) {
      console.error("[signal] attendance error:", (e as Error).message);
    }
  })();

  // Tell the newcomer who's already here.
  void (async () => {
    const others = await io.in(roomCode).fetchSockets();
    const peers = others
      .filter((s) => s.id !== socket.id)
      .map((s) => ({ socketId: s.id, user: s.data.user as RoomUser }));
    socket.emit("peers", peers);
  })();

  // Announce the newcomer to existing peers.
  socket.to(roomCode).emit("peer-joined", { socketId: socket.id, user });

  // Relay SDP offers/answers and ICE candidates to a specific peer.
  socket.on("signal", ({ to, description, candidate }) => {
    io.to(to).emit("signal", { from: socket.id, description, candidate });
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

  socket.on("disconnect", async () => {
    socket.to(roomCode).emit("peer-left", { socketId: socket.id });
    const { meetingId, attendanceId, joinedAt } = socket.data as {
      meetingId?: string;
      attendanceId?: string;
      joinedAt?: Date;
    };
    if (!joinedAt) return;
    const left = new Date();
    const duration = Math.max(0, Math.round((left.getTime() - joinedAt.getTime()) / 1000));
    try {
      if (attendanceId) {
        await prisma.attendance.update({
          where: { id: attendanceId },
          data: { leftAt: left, durationSeconds: duration },
        });
      }
      if (meetingId) {
        await prisma.meetingParticipant.updateMany({
          where: { meetingId, userId: user.id },
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
