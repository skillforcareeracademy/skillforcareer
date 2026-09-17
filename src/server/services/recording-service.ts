import { randomUUID } from "node:crypto";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { ROLES } from "@/config/roles";
import { storageKeyFromUrl } from "@/lib/storage";
import { issuePlaybackToken, readPlaybackToken } from "@/lib/recording-token";
import type { PublicUser } from "@/server/services/auth-service";
import { checkRoomAccess } from "@/server/services/live-access";
import type {
  RecordingBlock,
  RecordingControlInput,
  RecordingViewInput,
} from "@/lib/validations/recording";

/**
 * Controlled playback of a class recording.
 *
 * The client's ask, in full: "Recording jahan save hoti hai admin panel mein
 * control hona chahiye — kaun kaun se student ko, kitne din ke liye recording
 * dikhe, kitni baar dekh sakta hai, kitne devices mein dekh sakta hai. Student
 * only view kar sakta hai recording, watermark 'Skill For Career' ke saath …
 * Recording download nahi kar sakta."
 *
 * Three things follow from that, and they are the whole shape of this file:
 *
 *   1. A recording is a *grant*, not a URL. Nothing learner-facing ever carries
 *      `Meeting.recordingUrl` again; the only way to the bytes is
 *      GET /api/recordings/:id/stream, which answers to this module.
 *   2. Every allowance — audience, window, watches, devices — is resolved in one
 *      place (`resolveRecordingState`) so the card in the learner's list and the
 *      route that serves the bytes can never disagree about what they are owed.
 *   3. The counters are hot and raced, so they are written with
 *      `INSERT … ON DUPLICATE KEY UPDATE` rather than `prisma.upsert`. An upsert
 *      here is a SELECT then an INSERT, not one statement: two tabs opening the
 *      same recording together both find nothing and the second INSERT dies on
 *      `RecordingView_meetingId_userId_key`. This repo has been bitten by that
 *      before (see release-service's lesson view counter).
 */

// ── Tunables ─────────────────────────────────────────────────────────────────

/**
 * How long after a watch begins a fresh `POST …/view` still counts as the *same*
 * watch rather than a new one.
 *
 * Two minutes, chosen against what actually re-fires the call: a page reload, a
 * closed-and-reopened dialog, a dropped connection the player retries, a phone
 * rotating and remounting the tree. All of those land within seconds. It is well
 * short of anything a learner would call "watching it again", so nobody loses a
 * view to a stutter and nobody gets a second watch for free by nudging refresh.
 * A watch that is genuinely still running keeps its playback ticket instead, and
 * a ticketed ping never costs a view however long it has been.
 */
const SAME_WATCH_WINDOW_MS = 2 * 60 * 1000;

/** Sanity ceiling on the running `secondsWatched` total (about 278 hours). */
const MAX_SECONDS_WATCHED = 1_000_000;

/**
 * `lastSeenAt` a brand-new device row is born with: long enough ago that the
 * very next claim succeeds. It exists so "is this a new watch?" is decided by a
 * single conditional UPDATE rather than by a read followed by a write — see
 * `claimNewWatch`.
 */
const NEVER_SEEN = new Date(86_400_000); // 1970-01-02

// ── Types ────────────────────────────────────────────────────────────────────

/** The recording-shaped half of a Meeting row. */
export interface RecordingRules {
  id: string;
  recordingUrl: string | null;
  recordingPublished: boolean;
  recordingPublishedAt: Date | null;
  recordingAvailableDays: number | null;
  recordingAvailableUntil: Date | null;
  recordingViewLimit: number;
  recordingDeviceLimit: number;
  recordingWatermark: boolean;
  watermarkRemovalPrice: Prisma.Decimal | null;
}

/** `select` that fills a `RecordingRules`. */
export const RECORDING_RULE_SELECT = {
  id: true,
  recordingUrl: true,
  recordingPublished: true,
  recordingPublishedAt: true,
  recordingAvailableDays: true,
  recordingAvailableUntil: true,
  recordingViewLimit: true,
  recordingDeviceLimit: true,
  recordingWatermark: true,
  watermarkRemovalPrice: true,
} as const;

/** A per-learner or per-cohort loosening of the meeting's own settings. */
interface AudienceOverride {
  expiresAt: Date | null;
  viewLimit: number | null;
}

interface Usage {
  viewCount: number;
  devices: number;
  watermarkWaived: boolean;
}

/** Everything the learner's card and the player need to know. */
export interface RecordingState {
  /** Is there a recording here for this learner at all? */
  available: boolean;
  canWatch: boolean;
  reason: RecordingBlock | null;
  /** The refusal, in words a learner can act on. */
  message: string | null;
  /** Null = unlimited, in every pair below. */
  viewLimit: number | null;
  viewsUsed: number;
  viewsLeft: number | null;
  deviceLimit: number | null;
  devicesUsed: number;
  devicesLeft: number | null;
  /** Whether the overlay is on for *this* learner (off once they've paid). */
  watermark: boolean;
  /** Price to take the overlay off, or null when it isn't for sale. */
  watermarkPrice: number | null;
  watermarkPaid: boolean;
  /** When access ends, if it ends. */
  expiresAt: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const decimal = (d: Prisma.Decimal | null): number | null =>
  d == null ? null : d.toNumber();

/** 0 and null both mean "no cap" throughout the admin UI. */
function cap(value: number | null | undefined): number | null {
  return value != null && value > 0 ? value : null;
}

function prettyDate(d: Date): string {
  return format(d, "d MMM yyyy");
}

/** The out-of-watches refusal, worded so a cap of one doesn't read like a typo. */
function viewLimitMessage(limit: number): string {
  const spent = limit === 1 ? "your one view" : `all ${limit} views`;
  return `You've used ${spent} of this recording. Ask your instructor to reset it.`;
}

/**
 * When this learner's access ends.
 *
 * An explicit end date wins over "N days from publishing", because an admin who
 * typed a date meant that date. A per-row `expiresAt` replaces both — that row
 * exists precisely to give one learner a different deadline.
 */
export function recordingWindowEnd(
  rules: RecordingRules,
  override: AudienceOverride | null,
): Date | null {
  if (override?.expiresAt) return override.expiresAt;
  if (rules.recordingAvailableUntil) return rules.recordingAvailableUntil;
  if (rules.recordingAvailableDays && rules.recordingPublishedAt) {
    return new Date(
      rules.recordingPublishedAt.getTime() +
        rules.recordingAvailableDays * 86_400_000,
    );
  }
  return null;
}

/**
 * One learner's standing with one recording. Pure: the caller does the reads, so
 * resolving a whole page of recordings costs the same three queries as one.
 *
 * The device limit is deliberately *not* a refusal here. Deciding it needs the
 * device the learner is holding, which a server-rendered list has no way of
 * knowing — so the card reports "2 of 2 devices used" and the refusal, if there
 * is one, comes from `registerRecordingView` when they actually press play.
 */
export function resolveRecordingState(
  rules: RecordingRules,
  opts: {
    inAudience: boolean;
    override: AudienceOverride | null;
    usage: Usage;
    now?: Date;
  },
): RecordingState {
  const now = opts.now ?? new Date();
  const viewLimit = cap(opts.override?.viewLimit ?? rules.recordingViewLimit);
  const deviceLimit = cap(rules.recordingDeviceLimit);
  const viewsUsed = opts.usage.viewCount;
  const devicesUsed = opts.usage.devices;
  const until = recordingWindowEnd(rules, opts.override);
  const price = decimal(rules.watermarkRemovalPrice);

  const base: Omit<
    RecordingState,
    "available" | "canWatch" | "reason" | "message"
  > = {
    viewLimit,
    viewsUsed,
    viewsLeft: viewLimit == null ? null : Math.max(0, viewLimit - viewsUsed),
    deviceLimit,
    devicesUsed,
    devicesLeft:
      deviceLimit == null ? null : Math.max(0, deviceLimit - devicesUsed),
    // A learner who has bought the overlay off keeps it off, even if an admin
    // later turns the watermark back on for everyone else.
    watermark: rules.recordingWatermark && !opts.usage.watermarkWaived,
    watermarkPrice: price && price > 0 ? price : null,
    watermarkPaid: opts.usage.watermarkWaived,
    expiresAt: until ? until.toISOString() : null,
  };

  const hidden = (reason: RecordingBlock): RecordingState => ({
    ...base,
    available: false,
    canWatch: false,
    reason,
    message: null,
  });

  // Nothing uploaded, not published yet, or not this learner's to see: the card
  // looks exactly like a class that was never recorded. A learner outside the
  // audience is told nothing, because there is nothing they can do about it.
  if (!rules.recordingUrl) return hidden("NO_FILE");
  if (!rules.recordingPublished) return hidden("UNPUBLISHED");
  if (!opts.inAudience) return hidden("NOT_IN_AUDIENCE");

  if (until && until.getTime() <= now.getTime()) {
    return {
      ...base,
      available: true,
      canWatch: false,
      reason: "EXPIRED",
      message: `This recording was available until ${prettyDate(until)}. Ask your instructor if you still need it.`,
    };
  }

  if (viewLimit != null && viewsUsed >= viewLimit) {
    return {
      ...base,
      available: true,
      canWatch: false,
      reason: "VIEW_LIMIT",
      message: viewLimitMessage(viewLimit),
    };
  }

  return {
    ...base,
    available: true,
    canWatch: true,
    reason: null,
    message: null,
  };
}

/** A short, human summary of a user agent — "Chrome on Android". */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const ua = userAgent;
  // Order matters: Chrome's UA also claims Safari, and the iOS builds of both
  // Chrome and Firefox announce themselves under their own tokens.
  const browser = /Edg[A-Za-z]*\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /CriOS\//.test(ua)
        ? "Chrome"
        : /FxiOS\//.test(ua)
          ? "Firefox"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : /Chrome\//.test(ua)
              ? "Chrome"
              : /Safari\//.test(ua)
                ? "Safari"
                : "Browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  return os ? `${browser} on ${os}` : browser;
}

/** True for anyone who manages the class rather than attends it. */
function isStaffFor(user: PublicUser, hostId: string): boolean {
  return (
    user.id === hostId ||
    user.role === ROLES.SUPER_ADMIN ||
    user.role === ROLES.ADMIN ||
    user.role === ROLES.INSTRUCTOR
  );
}

/**
 * Pick the row that governs this learner out of the ones that matched.
 *
 * A row naming the learner beats a row naming their cohort — it was added for
 * them. Between cohort rows, the most generous wins: two batches both granting
 * access should not leave a learner with the stingier of the two deadlines.
 */
function pickOverride(
  rows: {
    userId: string | null;
    expiresAt: Date | null;
    viewLimit: number | null;
  }[],
): AudienceOverride | null {
  if (rows.length === 0) return null;
  const personal = rows.find((r) => r.userId);
  if (personal)
    return { expiresAt: personal.expiresAt, viewLimit: personal.viewLimit };

  let expiresAt: Date | null = rows[0].expiresAt;
  let viewLimit: number | null = rows[0].viewLimit;
  for (const r of rows.slice(1)) {
    // Null = "inherit", which is at least as generous as any date or cap.
    if (expiresAt && (r.expiresAt == null || r.expiresAt > expiresAt))
      expiresAt = r.expiresAt;
    if (
      viewLimit != null &&
      (r.viewLimit == null || r.viewLimit === 0 || r.viewLimit > viewLimit)
    ) {
      viewLimit = r.viewLimit;
    }
  }
  return { expiresAt, viewLimit };
}

// ── Learner reads ────────────────────────────────────────────────────────────

/**
 * Resolve recording state for a page full of meetings in three queries.
 *
 * `meetings` must already be narrowed to classes this learner could have
 * attended — `listStudentMeetings` does exactly that — which is what lets an
 * empty audience mean "everyone who could attend" without a per-meeting check.
 */
export async function learnerRecordingStates(
  userId: string,
  meetings: RecordingRules[],
  batchIds: string[],
): Promise<Map<string, RecordingState>> {
  const out = new Map<string, RecordingState>();
  const empty: Usage = { viewCount: 0, devices: 0, watermarkWaived: false };

  // Only the ones with something to show are worth loading usage for.
  const live = meetings.filter((m) => m.recordingUrl && m.recordingPublished);
  const liveIds = new Set(live.map((m) => m.id));
  for (const m of meetings) {
    if (!liveIds.has(m.id)) {
      out.set(
        m.id,
        resolveRecordingState(m, {
          inAudience: false,
          override: null,
          usage: empty,
        }),
      );
    }
  }
  if (live.length === 0) return out;

  const ids = live.map((m) => m.id);
  const [accessRows, viewRows, deviceRows] = await Promise.all([
    prisma.recordingAccess.findMany({
      where: { meetingId: { in: ids } },
      select: {
        meetingId: true,
        batchId: true,
        userId: true,
        expiresAt: true,
        viewLimit: true,
      },
    }),
    prisma.recordingView.findMany({
      where: { userId, meetingId: { in: ids } },
      select: { meetingId: true, viewCount: true, watermarkWaivedAt: true },
    }),
    prisma.recordingDevice.groupBy({
      by: ["meetingId"],
      where: { userId, meetingId: { in: ids } },
      _count: { _all: true },
    }),
  ]);

  const mine = new Set(batchIds);
  const gated = new Set(accessRows.map((r) => r.meetingId));
  const viewByMeeting = new Map(viewRows.map((v) => [v.meetingId, v]));
  const devicesByMeeting = new Map(
    deviceRows.map((d) => [d.meetingId, d._count._all]),
  );

  for (const m of live) {
    const rows = accessRows.filter(
      (r) =>
        r.meetingId === m.id &&
        ((r.userId && r.userId === userId) ||
          (r.batchId && mine.has(r.batchId))),
    );
    // No rows anywhere for this meeting = open to the whole class.
    const inAudience = !gated.has(m.id) || rows.length > 0;
    const view = viewByMeeting.get(m.id);
    out.set(
      m.id,
      resolveRecordingState(m, {
        inAudience,
        override: pickOverride(rows),
        usage: {
          viewCount: view?.viewCount ?? 0,
          devices: devicesByMeeting.get(m.id) ?? 0,
          watermarkWaived: Boolean(view?.watermarkWaivedAt),
        },
      }),
    );
  }
  return out;
}

export interface LoadedRecording {
  meeting: RecordingRules & {
    title: string;
    hostId: string;
    courseId: string | null;
    batchId: string | null;
    provider: string;
    roomCode: string;
  };
  /** Staff and the host preview the file directly — no window, no counters. */
  staff: boolean;
  state: RecordingState;
}

/**
 * One learner (or one member of staff) against one recording, with every check
 * the stream and view routes need. Throws 404 when there is nothing to serve.
 */
export async function loadRecordingForUser(
  user: PublicUser,
  meetingId: string,
): Promise<LoadedRecording> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      ...RECORDING_RULE_SELECT,
      title: true,
      hostId: true,
      courseId: true,
      batchId: true,
      provider: true,
      roomCode: true,
    },
  });
  if (!meeting) throw AppError.notFound("Recording not found.");

  const staff = isStaffFor(user, meeting.hostId);
  if (staff) {
    // Staff preview the file as it is: unpublished, expired or capped, they
    // still need to check what they are about to hand out. The admin panel is
    // where the real flags are shown, so nothing is hidden by doing this.
    return {
      meeting,
      staff: true,
      state: {
        available: Boolean(meeting.recordingUrl),
        canWatch: Boolean(meeting.recordingUrl),
        reason: meeting.recordingUrl ? null : "NO_FILE",
        message: null,
        viewLimit: null,
        viewsUsed: 0,
        viewsLeft: null,
        deviceLimit: null,
        devicesUsed: 0,
        devicesLeft: null,
        watermark: false,
        watermarkPrice: null,
        watermarkPaid: false,
        expiresAt: null,
      },
    };
  }

  const accessRows = await prisma.recordingAccess.findMany({
    where: { meetingId },
    select: { batchId: true, userId: true, expiresAt: true, viewLimit: true },
  });

  let matched: typeof accessRows = [];
  let inAudience: boolean;
  if (accessRows.length === 0) {
    // Nobody named: whoever could have walked into the class can watch it back.
    inAudience = await checkRoomAccess(user.id, user.role, {
      id: meeting.id,
      host: { id: meeting.hostId },
      courseId: meeting.courseId,
      batchId: meeting.batchId,
      provider: meeting.provider,
      roomCode: meeting.roomCode,
    });
  } else {
    const personal = accessRows.filter((r) => r.userId === user.id);
    const batchRows = accessRows.filter((r) => r.batchId);
    let mine: string[] = [];
    if (batchRows.length > 0) {
      const enrollments = await prisma.enrollment.findMany({
        where: {
          userId: user.id,
          status: { in: ["ACTIVE", "COMPLETED"] },
          batchId: { in: batchRows.map((r) => r.batchId!) },
        },
        select: { batchId: true },
      });
      mine = enrollments.map((e) => e.batchId!).filter(Boolean);
    }
    matched = [
      ...personal,
      ...batchRows.filter((r) => r.batchId && mine.includes(r.batchId)),
    ];
    inAudience = matched.length > 0;
  }

  const [view, devices] = await Promise.all([
    prisma.recordingView.findUnique({
      where: { meetingId_userId: { meetingId, userId: user.id } },
      select: { viewCount: true, watermarkWaivedAt: true },
    }),
    prisma.recordingDevice.count({ where: { meetingId, userId: user.id } }),
  ]);

  return {
    meeting,
    staff: false,
    state: resolveRecordingState(meeting, {
      inAudience,
      override: pickOverride(matched),
      usage: {
        viewCount: view?.viewCount ?? 0,
        devices,
        watermarkWaived: Boolean(view?.watermarkWaivedAt),
      },
    }),
  };
}

/** The storage key behind a recording, or a refusal the admin can act on. */
export function recordingStorageKey(recordingUrl: string): string {
  const key = storageKeyFromUrl(recordingUrl);
  if (!key) {
    throw AppError.badRequest(
      "This recording isn't stored on the platform, so it can't be played back under these controls.",
    );
  }
  return key;
}

// ── Learner writes ───────────────────────────────────────────────────────────

export interface ViewRegistration {
  viewsUsed: number;
  viewsLeft: number | null;
  devicesUsed: number;
  devicesLeft: number | null;
  watermark: boolean;
  /** Learner name + email, burned into the overlay. */
  watermarkName: string;
  watermarkEmail: string;
  token: string;
  tokenExpiresAt: string;
  /** True when this call was a continuation and cost nothing. */
  sameWatch: boolean;
}

/**
 * Called when playback actually begins, and again when it pauses, ends or the
 * dialog closes. Registers the device, spends a view if this is a new watch, and
 * hands back the ticket the stream route wants.
 */
export async function registerRecordingView(
  user: PublicUser,
  meetingId: string,
  deviceId: string,
  userAgent: string | null,
  input: RecordingViewInput,
): Promise<ViewRegistration> {
  const loaded = await loadRecordingForUser(user, meetingId);
  const { state } = loaded;

  const ticket = () =>
    issuePlaybackToken({ meetingId, userId: user.id, deviceId });

  // Staff preview: no device, no counter, no cap.
  if (loaded.staff) {
    const { token, expiresAt } = ticket();
    return {
      viewsUsed: 0,
      viewsLeft: null,
      devicesUsed: 0,
      devicesLeft: null,
      watermark: false,
      watermarkName: user.name,
      watermarkEmail: user.email,
      token,
      tokenExpiresAt: expiresAt,
      sameWatch: true,
    };
  }

  if (!state.available) throw AppError.notFound("Recording not found.");

  // A ping carrying a live ticket for this same device is the watch that is
  // already running: top up the seconds and leave the counters alone, however
  // long ago it started.
  const claims = input.token ? readPlaybackToken(input.token) : null;
  const continuing =
    claims != null &&
    claims.meetingId === meetingId &&
    claims.userId === user.id &&
    claims.deviceId === deviceId;

  if (continuing) {
    await Promise.all([
      touchDevice(meetingId, user.id, deviceId, userAgent),
      addSecondsWatched(meetingId, user.id, input.secondsWatched ?? 0),
    ]);
    // Hand the same ticket back rather than a fresh one: the ticket is part of
    // the `<video>` src, and changing it mid-watch would reload the element and
    // throw the learner back to the start.
    return {
      ...snapshot(state, state.viewsUsed, state.devicesUsed),
      watermarkName: user.name,
      watermarkEmail: user.email,
      token: input.token!,
      tokenExpiresAt: claims.expiresAt,
      sameWatch: true,
    };
  }

  if (!state.canWatch)
    throw AppError.forbidden(
      state.message ?? "You can't watch this recording.",
    );

  // ── Device ────────────────────────────────────────────────────────────────
  const known = await prisma.recordingDevice.findFirst({
    where: { meetingId, userId: user.id, deviceId },
    select: { id: true },
  });
  if (!known && state.devicesLeft != null && state.devicesLeft <= 0) {
    throw AppError.forbidden(
      `You've already watched this recording on ${state.deviceLimit} ${
        state.deviceLimit === 1 ? "device" : "devices"
      }. Ask your instructor to remove one so you can use this one.`,
    );
  }
  if (!known) await createDeviceRow(meetingId, user.id, deviceId, userAgent);

  /**
   * Whether this is a new watch is decided by one conditional UPDATE, not by
   * reading `lastSeenAt` and then writing it.
   *
   * The read-then-write version double-counted: React remounts the player's
   * effect twice in development, both calls found no device row, and both spent
   * a view for a single press of play. A double-click or a retried request did
   * the same in production. Now exactly one caller can move `lastSeenAt` past
   * the window, and only that caller spends a view.
   */
  const sameWatch =
    (await claimNewWatch(meetingId, user.id, deviceId, userAgent)) === 0;

  // ── The view itself ───────────────────────────────────────────────────────
  if (!sameWatch) {
    await ensureViewRow(meetingId, user.id);
    const limit = state.viewLimit ?? 0;
    // One conditional statement, so the cap holds even if two tabs race. A
    // Prisma update would have to read the count first and could overshoot.
    const spent = await prisma.$executeRaw`
      UPDATE \`RecordingView\`
         SET viewCount = viewCount + 1,
             firstViewedAt = COALESCE(firstViewedAt, NOW(3)),
             lastViewedAt = NOW(3),
             updatedAt = NOW(3)
       WHERE meetingId = ${meetingId}
         AND userId = ${user.id}
         AND (${limit} = 0 OR viewCount < ${limit})`;
    if (spent === 0) throw AppError.forbidden(viewLimitMessage(limit));
  }
  if (input.secondsWatched) {
    await addSecondsWatched(meetingId, user.id, input.secondsWatched);
  }

  const [fresh, devices] = await Promise.all([
    prisma.recordingView.findUnique({
      where: { meetingId_userId: { meetingId, userId: user.id } },
      select: { viewCount: true },
    }),
    prisma.recordingDevice.count({ where: { meetingId, userId: user.id } }),
  ]);

  const { token, expiresAt } = ticket();
  return {
    ...snapshot(state, fresh?.viewCount ?? state.viewsUsed + 1, devices),
    watermarkName: user.name,
    watermarkEmail: user.email,
    token,
    tokenExpiresAt: expiresAt,
    sameWatch,
  };
}

function snapshot(
  state: RecordingState,
  viewsUsed: number,
  devicesUsed: number,
): Omit<
  ViewRegistration,
  "watermarkName" | "watermarkEmail" | "token" | "tokenExpiresAt" | "sameWatch"
> {
  return {
    viewsUsed,
    viewsLeft:
      state.viewLimit == null ? null : Math.max(0, state.viewLimit - viewsUsed),
    devicesUsed,
    devicesLeft:
      state.deviceLimit == null
        ? null
        : Math.max(0, state.deviceLimit - devicesUsed),
    watermark: state.watermark,
  };
}

/** Create the counter row if it isn't there, atomically. */
function ensureViewRow(meetingId: string, userId: string): Promise<number> {
  return prisma.$executeRaw`
    INSERT INTO \`RecordingView\`
      (id, meetingId, userId, viewCount, secondsWatched, createdAt, updatedAt)
    VALUES (${randomUUID()}, ${meetingId}, ${userId}, 0, 0, NOW(3), NOW(3))
    ON DUPLICATE KEY UPDATE id = id`;
}

/** Keep a running watch's device row warm. Unconditional — see `claimNewWatch`. */
function touchDevice(
  meetingId: string,
  userId: string,
  deviceId: string,
  userAgent: string | null,
): Promise<number> {
  return prisma.$executeRaw`
    INSERT INTO \`RecordingDevice\`
      (id, meetingId, userId, deviceId, label, firstSeenAt, lastSeenAt)
    VALUES (${randomUUID()}, ${meetingId}, ${userId}, ${deviceId}, ${describeDevice(userAgent)}, NOW(3), NOW(3))
    ON DUPLICATE KEY UPDATE lastSeenAt = NOW(3), label = ${describeDevice(userAgent)}`;
}

/**
 * First sighting of a device, born already "stale" so the claim below can treat
 * a new device and a long-idle one identically. `ON DUPLICATE KEY UPDATE id = id`
 * makes a racing second insert a no-op rather than a P2002.
 */
function createDeviceRow(
  meetingId: string,
  userId: string,
  deviceId: string,
  userAgent: string | null,
): Promise<number> {
  return prisma.$executeRaw`
    INSERT INTO \`RecordingDevice\`
      (id, meetingId, userId, deviceId, label, firstSeenAt, lastSeenAt)
    VALUES (${randomUUID()}, ${meetingId}, ${userId}, ${deviceId}, ${describeDevice(userAgent)}, NOW(3), ${NEVER_SEEN})
    ON DUPLICATE KEY UPDATE id = id`;
}

/**
 * Try to start a new watch on this device. Returns 1 for the caller that won it
 * and 0 for everyone else, whose call is the same watch continuing.
 */
function claimNewWatch(
  meetingId: string,
  userId: string,
  deviceId: string,
  userAgent: string | null,
): Promise<number> {
  const seconds = Math.round(SAME_WATCH_WINDOW_MS / 1000);
  return prisma.$executeRaw`
    UPDATE \`RecordingDevice\`
       SET lastSeenAt = NOW(3), label = ${describeDevice(userAgent)}
     WHERE meetingId = ${meetingId}
       AND userId = ${userId}
       AND deviceId = ${deviceId}
       AND lastSeenAt < DATE_SUB(NOW(3), INTERVAL ${seconds} SECOND)`;
}

function addSecondsWatched(
  meetingId: string,
  userId: string,
  seconds: number,
): Promise<number> {
  if (seconds <= 0) return Promise.resolve(0);
  return prisma.$executeRaw`
    UPDATE \`RecordingView\`
       SET secondsWatched = LEAST(secondsWatched + ${seconds}, ${MAX_SECONDS_WATCHED}),
           updatedAt = NOW(3)
     WHERE meetingId = ${meetingId} AND userId = ${userId}`;
}

/**
 * Record that a learner has paid the overlay off this one recording.
 *
 * Idempotent, and deliberately so: the Razorpay webhook and the browser's own
 * success callback both land here, and whichever arrives second must be a no-op.
 * Called from payment-service once a payment is claimed as PAID.
 */
export async function waiveRecordingWatermark(
  meetingId: string,
  userId: string,
  paymentId: string,
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO \`RecordingView\`
      (id, meetingId, userId, viewCount, secondsWatched, watermarkWaivedAt, watermarkPaymentId, createdAt, updatedAt)
    VALUES (${randomUUID()}, ${meetingId}, ${userId}, 0, 0, NOW(3), ${paymentId}, NOW(3), NOW(3))
    ON DUPLICATE KEY UPDATE
      watermarkWaivedAt = COALESCE(watermarkWaivedAt, NOW(3)),
      watermarkPaymentId = COALESCE(watermarkPaymentId, ${paymentId}),
      updatedAt = NOW(3)`;
}

/** What a learner must pay for this recording, checked against their access. */
export async function watermarkPurchaseContext(
  user: PublicUser,
  meetingId: string,
): Promise<{ title: string; price: number; alreadyPaid: boolean }> {
  const loaded = await loadRecordingForUser(user, meetingId);
  if (!loaded.state.available) throw AppError.notFound("Recording not found.");
  const price = loaded.state.watermarkPrice;
  if (!price || price <= 0) {
    throw AppError.badRequest(
      "The watermark can't be removed from this recording.",
    );
  }
  return {
    title: loaded.meeting.title,
    price,
    alreadyPaid: loaded.state.watermarkPaid,
  };
}

// ── Admin ────────────────────────────────────────────────────────────────────

export interface RecordingDeviceRow {
  deviceId: string;
  label: string | null;
  lastSeenAt: string;
}

export interface RecordingViewerRow {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  viewCount: number;
  /** The cap that applies to this learner. Null = unlimited. */
  viewLimit: number | null;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  secondsWatched: number;
  watermarkWaivedAt: string | null;
  devices: RecordingDeviceRow[];
}

export interface RecordingControl {
  meetingId: string;
  title: string;
  hasFile: boolean;
  /** Staff keep a direct link to the file. Never sent to a learner. */
  recordingUrl: string | null;
  published: boolean;
  publishedAt: string | null;
  availableDays: number | null;
  /** `<input type="date">` value. */
  availableUntil: string | null;
  /** Where the window actually lands, once both settings are considered. */
  effectiveUntil: string | null;
  viewLimit: number;
  deviceLimit: number;
  watermark: boolean;
  watermarkRemovalPrice: number | null;
  audience: { batchIds: string[]; studentIds: string[] };
  batches: { id: string; name: string; courseTitle: string | null }[];
  learners: { id: string; name: string; email: string }[];
  viewers: RecordingViewerRow[];
}

export async function getRecordingControl(
  meetingId: string,
): Promise<RecordingControl> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      ...RECORDING_RULE_SELECT,
      title: true,
      courseId: true,
      batchId: true,
    },
  });
  if (!meeting) throw AppError.notFound("Live class not found.");

  const [accessRows, viewRows, deviceRows] = await Promise.all([
    prisma.recordingAccess.findMany({
      where: { meetingId },
      select: { batchId: true, userId: true, expiresAt: true, viewLimit: true },
    }),
    prisma.recordingView.findMany({
      where: { meetingId },
      orderBy: { lastViewedAt: "desc" },
      take: 500,
      select: {
        userId: true,
        viewCount: true,
        firstViewedAt: true,
        lastViewedAt: true,
        secondsWatched: true,
        watermarkWaivedAt: true,
      },
    }),
    prisma.recordingDevice.findMany({
      where: { meetingId },
      orderBy: { lastSeenAt: "desc" },
      take: 2000,
      select: { userId: true, deviceId: true, label: true, lastSeenAt: true },
    }),
  ]);

  const grantedBatchIds = accessRows
    .map((r) => r.batchId)
    .filter((b): b is string => !!b);
  const grantedUserIds = accessRows
    .map((r) => r.userId)
    .filter((u): u is string => !!u);

  // Anyone who watched, plus anyone named in the audience — so a learner who was
  // granted access but hasn't opened it yet still shows in the table.
  const viewerIds = [
    ...new Set([
      ...viewRows.map((v) => v.userId),
      ...deviceRows.map((d) => d.userId),
    ]),
  ];

  const [batches, learners, viewerUsers] = await Promise.all([
    prisma.batch.findMany({
      where: meeting.courseId
        ? {
            OR: [
              { courseId: meeting.courseId },
              { id: { in: grantedBatchIds } },
            ],
          }
        : {},
      select: { id: true, name: true, course: { select: { title: true } } },
      orderBy: { startDate: "desc" },
      take: 200,
    }),
    listRecordingLearnerCandidates(meeting, grantedUserIds),
    viewerIds.length
      ? prisma.user.findMany({
          where: { id: { in: viewerIds } },
          select: { id: true, name: true, email: true, avatarUrl: true },
        })
      : Promise.resolve([]),
  ]);

  const userById = new Map(viewerUsers.map((u) => [u.id, u]));
  const devicesByUser = new Map<string, RecordingDeviceRow[]>();
  for (const d of deviceRows) {
    const list = devicesByUser.get(d.userId) ?? [];
    list.push({
      deviceId: d.deviceId,
      label: d.label,
      lastSeenAt: d.lastSeenAt.toISOString(),
    });
    devicesByUser.set(d.userId, list);
  }

  const viewers: RecordingViewerRow[] = viewerIds.flatMap((userId) => {
    const u = userById.get(userId);
    if (!u) return [];
    const v = viewRows.find((r) => r.userId === userId);
    const rows = accessRows.filter((r) => r.userId === userId);
    const override = pickOverride(rows);
    return [
      {
        userId,
        name: u.name,
        email: u.email,
        avatarUrl: u.avatarUrl,
        viewCount: v?.viewCount ?? 0,
        viewLimit: cap(override?.viewLimit ?? meeting.recordingViewLimit),
        firstViewedAt: v?.firstViewedAt?.toISOString() ?? null,
        lastViewedAt: v?.lastViewedAt?.toISOString() ?? null,
        secondsWatched: v?.secondsWatched ?? 0,
        watermarkWaivedAt: v?.watermarkWaivedAt?.toISOString() ?? null,
        devices: devicesByUser.get(userId) ?? [],
      },
    ];
  });

  const effectiveUntil = recordingWindowEnd(meeting, null);

  return {
    meetingId,
    title: meeting.title,
    hasFile: Boolean(meeting.recordingUrl),
    recordingUrl: meeting.recordingUrl,
    published: meeting.recordingPublished,
    publishedAt: meeting.recordingPublishedAt?.toISOString() ?? null,
    availableDays: meeting.recordingAvailableDays,
    availableUntil: meeting.recordingAvailableUntil
      ? format(meeting.recordingAvailableUntil, "yyyy-MM-dd")
      : null,
    effectiveUntil: effectiveUntil ? effectiveUntil.toISOString() : null,
    viewLimit: meeting.recordingViewLimit,
    deviceLimit: meeting.recordingDeviceLimit,
    watermark: meeting.recordingWatermark,
    watermarkRemovalPrice: decimal(meeting.watermarkRemovalPrice),
    audience: {
      batchIds: [...new Set(grantedBatchIds)],
      studentIds: [...new Set(grantedUserIds)],
    },
    batches: batches.map((b) => ({
      id: b.id,
      name: b.name,
      courseTitle: b.course?.title ?? null,
    })),
    learners,
    viewers,
  };
}

/**
 * Learners worth offering in the audience picker: whoever the class's course or
 * cohort implies, whoever was hand-added to the class, and anyone already
 * granted access (so an existing grant can be seen and removed).
 */
async function listRecordingLearnerCandidates(
  meeting: { id: string; courseId: string | null; batchId: string | null },
  grantedUserIds: string[],
): Promise<{ id: string; name: string; email: string }[]> {
  const enrolment: Prisma.EnrollmentWhereInput[] = [];
  if (meeting.courseId) enrolment.push({ courseId: meeting.courseId });
  if (meeting.batchId) enrolment.push({ batchId: meeting.batchId });

  const or: Prisma.UserWhereInput[] = [
    { meetingParts: { some: { meetingId: meeting.id } } },
  ];
  if (enrolment.length) {
    or.push({
      enrollments: {
        some: { status: { in: ["ACTIVE", "COMPLETED"] }, OR: enrolment },
      },
    });
  }
  if (grantedUserIds.length) or.push({ id: { in: grantedUserIds } });

  const rows = await prisma.user.findMany({
    where: { OR: or },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
    take: 500,
  });
  return rows;
}

export async function saveRecordingControl(
  meetingId: string,
  input: RecordingControlInput,
): Promise<void> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, recordingPublished: true, recordingPublishedAt: true },
  });
  if (!meeting) throw AppError.notFound("Live class not found.");

  /**
   * The publication stamp restarts on every off→on transition, because an admin
   * who publishes today means "thirty days from today". Turning it off leaves
   * the old stamp alone so an accidental unpublish-republish doesn't silently
   * rewrite history — only a deliberate re-publish does.
   */
  const publishedAt = input.published
    ? meeting.recordingPublished && meeting.recordingPublishedAt
      ? meeting.recordingPublishedAt
      : new Date()
    : meeting.recordingPublishedAt;

  /**
   * An end date is inclusive: "available until 30 Sep" has to include the 30th,
   * so it lands at the last moment of that day rather than at midnight opening
   * it. Parsed without a zone, so it is the last moment of that day in the
   * *server's* timezone — on a UTC host that runs a few hours past midnight in
   * India, which errs towards giving a learner slightly longer rather than
   * cutting them off a day early.
   */
  const until = input.availableUntil
    ? new Date(`${input.availableUntil}T23:59:59.999`)
    : null;
  const price =
    input.watermarkRemovalPrice && input.watermarkRemovalPrice > 0
      ? new Prisma.Decimal(input.watermarkRemovalPrice)
      : null;

  // Raw UPDATE rather than `prisma.meeting.update`: relationMode = "prisma"
  // turns one Prisma write on a nine-relation model into a fan-out of SELECTs
  // before the write lands, and none of these columns can orphan a row.
  await prisma.$executeRaw`
    UPDATE \`Meeting\`
       SET recordingPublished = ${input.published},
           recordingPublishedAt = ${publishedAt},
           recordingAvailableDays = ${input.availableDays},
           recordingAvailableUntil = ${until},
           recordingViewLimit = ${input.viewLimit},
           recordingDeviceLimit = ${input.deviceLimit},
           recordingWatermark = ${input.watermark},
           watermarkRemovalPrice = ${price},
           updatedAt = NOW(3)
     WHERE id = ${meetingId}`;

  // The grant list is a set the editor always sends whole, so replace it rather
  // than diff it — two statements beat N upserts against a distant database.
  const batchIds = [...new Set(input.batchIds)];
  const studentIds = [...new Set(input.studentIds)];
  await prisma.recordingAccess.deleteMany({ where: { meetingId } });
  const rows = [
    ...batchIds.map((batchId) => ({ meetingId, batchId })),
    ...studentIds.map((userId) => ({ meetingId, userId })),
  ];
  if (rows.length > 0) await prisma.recordingAccess.createMany({ data: rows });
}

/**
 * Give a learner their watches back — the "sir mera phone change ho gaya" case.
 * The row is zeroed rather than deleted so a paid watermark waiver survives.
 */
export async function resetRecordingViews(
  meetingId: string,
  userId: string,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE \`RecordingView\`
       SET viewCount = 0, firstViewedAt = NULL, lastViewedAt = NULL, updatedAt = NOW(3)
     WHERE meetingId = ${meetingId} AND userId = ${userId}`;
}

export async function removeRecordingDevice(
  meetingId: string,
  userId: string,
  deviceId: string,
): Promise<void> {
  await prisma.recordingDevice.deleteMany({
    where: { meetingId, userId, deviceId },
  });
}
