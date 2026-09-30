import { z } from "zod";

/** The seven libraries the academy files things in. */
export const GROUP_KINDS = [
  "QUIZ",
  "MATERIAL",
  "CURRICULUM",
  "ASSIGNMENT",
  "BATCH",
  "CERTIFICATE",
  "DISCUSSION",
] as const;

export const groupKindSchema = z.enum(GROUP_KINDS);

export const createGroupSchema = z.object({
  kind: groupKindSchema,
  name: z.string().trim().min(1, "Give the group a name").max(120),
  /** Set to nest it; nesting is not depth-limited. */
  parentId: z.string().trim().optional().or(z.literal("")),
  description: z.string().trim().max(400).optional().or(z.literal("")),
});

export const updateGroupSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  /** "" moves it back to the top level; omitted leaves it where it is. */
  parentId: z.string().trim().optional(),
  description: z.string().trim().max(400).optional(),
});

export const reorderGroupsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

/** The groups an item is filed in — the picker sends the whole set. */
export const setGroupsSchema = z.object({
  kind: groupKindSchema,
  itemId: z.string().min(1),
  groupIds: z.array(z.string().min(1)).max(100),
});

export type GroupKindInput = z.infer<typeof groupKindSchema>;
