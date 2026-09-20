import { z } from "zod";

/**
 * Inputs for the batch profile: associate instructors, the CSV roster import,
 * batch notes and the quizzes/assignments set for a batch. Kept apart from
 * `batch.ts`, which describes the batch itself.
 */

/** Associate instructors to put on a batch beside its lead. */
export const batchAssociatesSchema = z.object({
  userIds: z
    .array(z.string().min(1))
    .min(1, "Pick at least one instructor")
    .max(50),
});

/** CSV roster upload. `csv` is the raw file text; the server does the parsing. */
export const batchImportSchema = z.object({
  csv: z.string().min(1, "Upload or paste a CSV first").max(1_000_000),
});

/** The columns the roster import reads, in template order. */
export const BATCH_IMPORT_HEADERS = ["name", "email", "phone"] as const;

/** Most rows one import will take — enough for any real cohort. */
export const BATCH_IMPORT_MAX_ROWS = 500;

// `BatchNote.title`, `fileUrl` and `fileName` are plain `String` columns, which
// Prisma maps to VARCHAR(191) on MySQL — hence the 191 caps below.
const fileUrl = z
  .string()
  .trim()
  .max(191, "That file link is too long — upload the file instead")
  .refine(
    (v) => v === "" || v.startsWith("/") || /^https?:\/\/\S+$/i.test(v),
    "Enter a valid link",
  );

export const batchNoteSchema = z
  .object({
    title: z.string().trim().min(2, "Give the note a title").max(191),
    body: z.string().trim().max(20_000).optional().or(z.literal("")),
    fileUrl: fileUrl.optional().or(z.literal("")),
    fileName: z.string().trim().max(191).optional().or(z.literal("")),
  })
  .refine((d) => Boolean(d.body) || Boolean(d.fileUrl), {
    message: "Add some text or attach a file",
    path: ["body"],
  });

/** Set an existing quiz or assignment for a batch. */
export const batchQuizSchema = z.object({ quizId: z.string().min(1) });
export const batchAssignmentSchema = z.object({
  assignmentId: z.string().min(1),
});

export type BatchNoteInput = z.infer<typeof batchNoteSchema>;
export type BatchImportInput = z.infer<typeof batchImportSchema>;
