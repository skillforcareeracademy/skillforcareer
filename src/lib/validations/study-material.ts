import { z } from "zod";

/**
 * Study material — the reading a course sets.
 *
 * Shaped like the quiz validations on purpose: the academy groups, numbers and
 * assigns material exactly as it does its papers, and a panel that behaves the
 * same in both places needs no explaining.
 */

export const materialCategorySchema = z.object({
  name: z.string().trim().min(1, "Give it a name").max(80),
  /** Set to nest it under a category; a sub-category can't hold its own. */
  parentId: z.string().trim().optional().or(z.literal("")),
});

/** One file, image, video or link attached to a piece of reading. */
export const materialAssetSchema = z.object({
  kind: z.enum(["FILE", "IMAGE", "VIDEO", "LINK"]).default("FILE"),
  url: z.string().trim().min(1).max(2000),
  name: z.string().trim().max(200).optional().or(z.literal("")),
  mimeType: z.string().trim().max(120).optional().or(z.literal("")),
  sizeBytes: z.number().int().min(0).optional(),
});

export const studyMaterialSchema = z.object({
  title: z.string().trim().min(2, "Give it a title").max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  /** The main course, kept for numbering; `courseIds` carries the rest. */
  courseId: z.string().trim().optional().or(z.literal("")),
  courseIds: z.array(z.string().min(1)).max(200).optional(),
  categoryId: z.string().trim().optional().or(z.literal("")),
  subCategoryId: z.string().trim().optional().or(z.literal("")),
  /** Every folder it is filed in — see the shared group system. */
  groupIds: z.array(z.string().min(1)).max(100).optional(),
  /** An uploaded document, or nothing when the material is written in the panel. */
  fileUrl: z.string().trim().max(500).optional().or(z.literal("")),
  fileName: z.string().trim().max(200).optional().or(z.literal("")),
  mimeType: z.string().trim().max(120).optional().or(z.literal("")),
  /** Everything else attached to it: more files, images, videos, links. */
  assets: z.array(materialAssetSchema).max(50).optional(),
  /**
   * The reading itself. HTML from the editor — headings, lists, emphasis — or
   * plain text typed before the editor existed.
   */
  body: z.string().max(400_000).optional().or(z.literal("")),
  downloadsEnabled: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  /** Empty both = everyone on the course, as with quizzes. */
  batchIds: z.array(z.string().min(1)).max(200).optional(),
  studentIds: z.array(z.string().min(1)).max(2000).optional(),
});

export const materialHighlightSchema = z.object({
  quote: z.string().trim().min(1).max(4000),
  startOffset: z.number().int().min(0).max(1_000_000).optional(),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
  color: z.enum(["yellow", "green", "blue", "pink"]).optional(),
});

export const materialReadSchema = z.object({
  seconds: z.number().min(0).max(600).optional(),
  opened: z.boolean().optional(),
});

export const HIGHLIGHT_COLORS = [
  { value: "yellow", label: "Yellow", swatch: "bg-amber-200" },
  { value: "green", label: "Green", swatch: "bg-emerald-200" },
  { value: "blue", label: "Blue", swatch: "bg-sky-200" },
  { value: "pink", label: "Pink", swatch: "bg-pink-200" },
] as const;

export type MaterialCategoryInput = z.infer<typeof materialCategorySchema>;
export type StudyMaterialInput = z.infer<typeof studyMaterialSchema>;
export type MaterialHighlightInput = z.infer<typeof materialHighlightSchema>;

/**
 * Every column the library can be exported with, in the order they appear.
 *
 * The academy picks which of these they want rather than always taking all
 * thirteen — "create a separate option for export where i can select what to
 * download and what not". The same list fills a blank sample sheet, so a sheet
 * written for importing has exactly the columns they chose.
 */
export const MATERIAL_EXPORT_COLUMNS = [
  { key: "number", label: "No." },
  { key: "title", label: "Title" },
  { key: "description", label: "Description" },
  { key: "folder", label: "Folder" },
  { key: "category", label: "Category" },
  { key: "subCategory", label: "Sub-category" },
  { key: "course", label: "Course" },
  { key: "courses", label: "All courses" },
  { key: "batches", label: "Batches" },
  { key: "fileUrl", label: "File URL" },
  { key: "fileName", label: "File name" },
  { key: "body", label: "Written text" },
  { key: "downloadsEnabled", label: "Downloads allowed" },
  { key: "isPublished", label: "Published" },
  { key: "readers", label: "Readers" },
  { key: "readMinutes", label: "Minutes read" },
  { key: "createdBy", label: "Added by" },
  { key: "createdAt", label: "Added on" },
  { key: "updatedAt", label: "Last changed" },
] as const;

export type MaterialExportColumn = (typeof MATERIAL_EXPORT_COLUMNS)[number]["key"];

/** What a sheet carries unless the academy says otherwise. */
export const DEFAULT_MATERIAL_COLUMNS: MaterialExportColumn[] = [
  "number",
  "title",
  "description",
  "folder",
  "course",
  "fileUrl",
  "fileName",
  "body",
  "downloadsEnabled",
  "isPublished",
];

/**
 * "Different sample download option for study material as per study material
 * type" — a sheet for reading typed into the panel should not suggest a file
 * URL, and one for files should not suggest a wall of text.
 */
export const MATERIAL_SAMPLE_KINDS = ["mixed", "written", "file", "link"] as const;
export type MaterialSampleKind = (typeof MATERIAL_SAMPLE_KINDS)[number];

export const MATERIAL_SAMPLE_LABEL: Record<MaterialSampleKind, string> = {
  mixed: "A bit of everything",
  written: "Written in the panel",
  file: "An uploaded document",
  link: "A link or a video",
};
