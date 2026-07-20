import { SignJWT, jwtVerify } from "jose";

/**
 * Short-lived signed token that lets an already-authenticated user connect to
 * the live-signaling server (a separate process that can't read the httpOnly
 * auth cookie). Minted server-side on the room page, verified by the signaling
 * server with the same secret.
 */

const encoder = new TextEncoder();

function secret(): Uint8Array {
  const s = process.env.JWT_ACCESS_SECRET;
  if (!s) throw new Error("Missing JWT_ACCESS_SECRET");
  return encoder.encode(s);
}

export interface RoomTokenClaims {
  sub: string; // user id
  name: string;
  avatarUrl: string | null;
  roomCode: string;
  isHost: boolean;
}

export async function signRoomToken(claims: RoomTokenClaims): Promise<string> {
  return new SignJWT({ ...claims, kind: "live-room" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("4h")
    .setSubject(claims.sub)
    .sign(secret());
}

export async function verifyRoomToken(token: string): Promise<RoomTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.kind !== "live-room") return null;
    return {
      sub: String(payload.sub),
      name: String(payload.name ?? "Guest"),
      avatarUrl: (payload.avatarUrl as string | null) ?? null,
      roomCode: String(payload.roomCode),
      isHost: Boolean(payload.isHost),
    };
  } catch {
    return null;
  }
}
