import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getMeetingByRoomCode } from "@/server/services/live-service";
import { formatIstSlot } from "@/lib/ist";

export const alt = "Live class on SkillForCareer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The picture a class link shows in a chat.
 *
 * Drawn per class rather than served as one fixed image, because the thing
 * worth seeing is which class it is — a shared link that says only
 * "SkillForCareer" tells the learner nothing they did not already know.
 *
 * Only the class name, its course and its time. Whoever has the link has
 * those already; who is attending does not belong on something forwarded
 * through a group chat.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const meeting = await getMeetingByRoomCode(code).catch(() => null);

  const title = meeting?.title ?? "Live class";
  const course = meeting?.courseTitle ?? null;
  const when = meeting
    ? formatIstSlot(meeting.scheduledStart, meeting.scheduledEnd)
    : null;

  // Read off disk rather than fetched: the generator runs on the server and a
  // round trip to our own origin is a request that can fail at the worst time.
  const logo = await readFile(
    join(process.cwd(), "public/images/brand/logo.png"),
  ).catch(() => null);

  // A long class name has to stay readable rather than overflow the card.
  const titleSize = title.length > 58 ? 52 : title.length > 36 ? 62 : 74;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background:
            "linear-gradient(135deg, #1b1033 0%, #2b1247 45%, #0f0a1e 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {logo ? (
            // The mark sits on white with rounded corners: its wordmark is dark
            // ink, and on a dark card it simply disappears otherwise.
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "white",
                borderRadius: 18,
                padding: "14px 20px",
              }}
            >
              <img
                src={`data:image/png;base64,${logo.toString("base64")}`}
                alt=""
                height={52}
              />
            </div>
          ) : (
            <span style={{ fontSize: 34, fontWeight: 700 }}>SkillForCareer</span>
          )}
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginLeft: "auto",
              background: "rgba(16,185,129,0.15)",
              border: "1px solid rgba(16,185,129,0.45)",
              borderRadius: 999,
              padding: "10px 24px",
              fontSize: 26,
              color: "#6ee7b7",
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                background: "#34d399",
              }}
            />
            Live class
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {course && (
            <span style={{ fontSize: 30, color: "rgba(255,255,255,0.62)" }}>
              {course}
            </span>
          )}
          <span
            style={{
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: -1,
            }}
          >
            {title}
          </span>
          {when && (
            <span style={{ fontSize: 32, color: "rgba(255,255,255,0.75)" }}>
              {when}
            </span>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 26,
            color: "rgba(255,255,255,0.55)",
          }}
        >
          <span>Tap to join</span>
          <span style={{ fontFamily: "monospace", letterSpacing: 2 }}>{code}</span>
        </div>
      </div>
    ),
    size,
  );
}
