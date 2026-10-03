import { z } from "zod";

/**
 * The on-screen notepad an instructor writes on while teaching.
 *
 * A page is kept as the strokes that were drawn, in coordinates from 0 to 1 —
 * so it reopens at any screen size and on any device, and a page costs a few
 * kilobytes rather than a megabyte of image.
 */

export const BOARD_TOOLS = ["pen", "highlighter", "eraser"] as const;
export type BoardTool = (typeof BOARD_TOOLS)[number];

export const BOARD_COLOURS = [
  { value: "#18181b", label: "Black" },
  { value: "#e11d48", label: "Red" },
  { value: "#2563eb", label: "Blue" },
  { value: "#16a34a", label: "Green" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#9333ea", label: "Purple" },
] as const;

export const strokeSchema = z.object({
  tool: z.enum(BOARD_TOOLS).default("pen"),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour")
    .default("#18181b"),
  /** Relative to the shorter side, so a line looks the same on any screen. */
  width: z.coerce.number().min(0.001).max(0.2).default(0.004),
  /**
   * A flat list of x, y, x, y… each from 0 to 1. Flat rather than a list of
   * points because a long lesson is tens of thousands of numbers and the pairs
   * would double the JSON.
   */
  points: z.array(z.number().min(-0.2).max(1.2)).min(2).max(20_000),
});

export type Stroke = z.infer<typeof strokeSchema>;

export const boardSlideSchema = z.object({
  title: z.string().trim().min(1, "Give the page a name").max(150),
  strokes: z.array(strokeSchema).max(2000).default([]),
  batchId: z.string().trim().optional().or(z.literal("")),
  meetingId: z.string().trim().optional().or(z.literal("")),
  courseId: z.string().trim().optional().or(z.literal("")),
});

export type BoardSlideInput = z.infer<typeof boardSlideSchema>;

export const boardListSchema = z.object({
  batchId: z.string().trim().optional(),
  meetingId: z.string().trim().optional(),
  courseId: z.string().trim().optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export type BoardListQuery = z.infer<typeof boardListSchema>;
