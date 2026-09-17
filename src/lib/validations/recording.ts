import { z } from "zod";

/** `<input type="date">` value. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A nullable whole number that also accepts the empty string a cleared number
 * input sends, so "no cap" and "field left blank" mean the same thing.
 */
function nullableInt(max: number) {
  return z
    .union([z.literal(""), z.coerce.number().int().min(1).max(max)])
    .nullable()
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v));
}

export const recordingControlSchema = z.object({
  published: z.boolean(),

  /// Days of access from publication, and a hard end date. Either, both or
  /// neither; the end date wins when both are set.
  availableDays: nullableInt(3650),
  availableUntil: z
    .union([z.literal(""), z.string().regex(DATE_ONLY, "Use a calendar date")])
    .nullable()
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),

  /// 0 = unlimited, in both cases.
  viewLimit: z.coerce.number().int().min(0).max(1000),
  deviceLimit: z.coerce.number().int().min(0).max(50),

  watermark: z.boolean(),
  /// Null or 0 = the overlay is not for sale.
  watermarkRemovalPrice: z
    .union([z.literal(""), z.coerce.number().min(0).max(1_000_000)])
    .nullable()
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),

  /// Who may watch. Both empty = everyone who could have attended the class.
  batchIds: z.array(z.string().min(1)).max(200).default([]),
  studentIds: z.array(z.string().min(1)).max(2000).default([]),
});

export type RecordingControlInput = z.infer<typeof recordingControlSchema>;

/**
 * What the player posts when a watch starts, and again when it pauses, ends or
 * the dialog closes. A call carrying a live `token` is the *same* watch
 * continuing, so it never costs a view — it only tops up `secondsWatched`.
 */
export const recordingViewSchema = z.object({
  token: z.string().max(800).optional(),
  /** Seconds played since the last report. Best-effort; capped server-side. */
  secondsWatched: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 3600)
    .optional(),
});

export type RecordingViewInput = z.infer<typeof recordingViewSchema>;

/** Per-learner housekeeping from the admin's "Who watched" table. */
export const recordingViewerActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reset-views") }),
  z.object({
    action: z.literal("remove-device"),
    deviceId: z.string().min(1).max(200),
  }),
]);

export type RecordingViewerAction = z.infer<typeof recordingViewerActionSchema>;

/** Why a learner cannot watch — one word the UI turns into a sentence. */
export const RECORDING_BLOCKS = [
  "NO_FILE",
  "UNPUBLISHED",
  "NOT_IN_AUDIENCE",
  "EXPIRED",
  "VIEW_LIMIT",
  "DEVICE_LIMIT",
  "UNPLAYABLE",
] as const;

export type RecordingBlock = (typeof RECORDING_BLOCKS)[number];
