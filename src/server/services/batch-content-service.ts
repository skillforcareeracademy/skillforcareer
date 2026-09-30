import { prisma } from "@/lib/prisma";
import type { GroupKind } from "@/generated/prisma/client";
import {
  batchGroups,
  groupOptions,
  setBatchGroups,
  type GroupOption,
} from "./content-group-service";

/**
 * Everything a cohort has been set, from the cohort's own page.
 *
 * "Provide me an option to add quiz, curriculum, study material, assignment
 * from batch tab. Because when I created a new tab then mujhe har ek quiz ko
 * alag alag open krke batch assign karne pdte hain. Bhot time waste hota hai."
 * So the assignment happens here instead — and in two ways, because the academy
 * asked for both: whole folders at once, and single items by name.
 *
 * A folder keeps giving: a quiz filed into it next week is already set for every
 * cohort holding that folder. Picking an item by name sets that one thing.
 */

export type ContentKind = Extract<
  GroupKind,
  "QUIZ" | "MATERIAL" | "ASSIGNMENT" | "CURRICULUM"
>;

export const CONTENT_KINDS: ContentKind[] = ["QUIZ", "MATERIAL", "ASSIGNMENT", "CURRICULUM"];

export interface ContentItem {
  id: string;
  title: string;
  /** The folders it is filed in, for the line under its name. */
  hint: string;
}

export interface BatchContentSection {
  kind: ContentKind;
  label: string;
  /** Folders handed to this cohort. */
  groupIds: string[];
  /** Items set for it by name. */
  itemIds: string[];
  /** Every folder in this library. */
  groups: GroupOption[];
  /** Everything in this library that could be set. */
  items: ContentItem[];
}

const LABEL: Record<ContentKind, string> = {
  QUIZ: "Quizzes",
  MATERIAL: "Study material",
  ASSIGNMENT: "Assignments",
  CURRICULUM: "Curriculum",
};

/** Items set for this cohort by name, per library. */
async function namedItems(batchId: string, kind: ContentKind): Promise<string[]> {
  switch (kind) {
    case "QUIZ": {
      const rows = await prisma.quizBatch.findMany({ where: { batchId }, select: { quizId: true } });
      return rows.map((r) => r.quizId);
    }
    case "MATERIAL": {
      const rows = await prisma.studyMaterialBatch.findMany({
        where: { batchId },
        select: { materialId: true },
      });
      return rows.map((r) => r.materialId);
    }
    case "ASSIGNMENT": {
      const rows = await prisma.assignmentBatch.findMany({
        where: { batchId },
        select: { assignmentId: true },
      });
      return rows.map((r) => r.assignmentId);
    }
    case "CURRICULUM": {
      const rows = await prisma.curriculumBatch.findMany({
        where: { batchId },
        select: { curriculumId: true },
      });
      return rows.map((r) => r.curriculumId);
    }
  }
}

/** Everything in one library that a cohort could be set. */
async function libraryItems(kind: ContentKind): Promise<ContentItem[]> {
  const paths = new Map((await groupOptions(kind)).map((g) => [g.id, g.path]));
  const filed = await prisma.contentGroupItem.findMany({
    where: { kind },
    select: { itemId: true, groupId: true },
  });
  const foldersOf = new Map<string, string[]>();
  for (const f of filed) {
    const path = paths.get(f.groupId);
    if (path) foldersOf.set(f.itemId, [...(foldersOf.get(f.itemId) ?? []), path]);
  }
  const hint = (id: string, fallback: string) =>
    (foldersOf.get(id) ?? []).join(" · ") || fallback;

  switch (kind) {
    case "QUIZ": {
      const rows = await prisma.quiz.findMany({
        orderBy: [{ sequence: "asc" }, { title: "asc" }],
        take: 1000,
        select: { id: true, title: true, course: { select: { title: true } } },
      });
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        hint: hint(r.id, r.course?.title ?? "Ungrouped"),
      }));
    }
    case "MATERIAL": {
      const rows = await prisma.studyMaterial.findMany({
        orderBy: [{ sequence: "asc" }, { title: "asc" }],
        take: 1000,
        select: { id: true, title: true, course: { select: { title: true } } },
      });
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        hint: hint(r.id, r.course?.title ?? "Ungrouped"),
      }));
    }
    case "ASSIGNMENT": {
      const rows = await prisma.assignment.findMany({
        orderBy: [{ createdAt: "desc" }],
        take: 1000,
        select: { id: true, title: true, course: { select: { title: true } } },
      });
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        hint: hint(r.id, r.course?.title ?? "Ungrouped"),
      }));
    }
    case "CURRICULUM": {
      const rows = await prisma.curriculum.findMany({
        orderBy: [{ sequence: "asc" }, { number: "asc" }],
        take: 1000,
        select: { id: true, title: true, curriculumId: true },
      });
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        hint: hint(r.id, r.curriculumId ?? "Ungrouped"),
      }));
    }
  }
}

/** What one cohort has been set, and what else it could be. */
export async function batchContent(batchId: string): Promise<BatchContentSection[]> {
  return Promise.all(
    CONTENT_KINDS.map(async (kind) => ({
      kind,
      label: LABEL[kind],
      groupIds: await batchGroups(batchId, kind),
      itemIds: await namedItems(batchId, kind),
      groups: await groupOptions(kind),
      items: await libraryItems(kind),
    })),
  );
}

/**
 * Set one library for one cohort. Both lists are replaced wholesale — the
 * screen's choices are the truth — and the two are independent: a folder can be
 * given without naming anything inside it.
 */
export async function setBatchContent(
  batchId: string,
  kind: ContentKind,
  input: { groupIds: string[]; itemIds: string[] },
): Promise<void> {
  await setBatchGroups(batchId, kind, input.groupIds);
  const itemIds = [...new Set(input.itemIds.filter(Boolean))];

  switch (kind) {
    case "QUIZ": {
      await prisma.quizBatch.deleteMany({ where: { batchId } });
      if (itemIds.length) {
        await prisma.quizBatch.createMany({
          data: itemIds.map((quizId) => ({ batchId, quizId })),
        });
      }
      return;
    }
    case "MATERIAL": {
      await prisma.studyMaterialBatch.deleteMany({ where: { batchId } });
      if (itemIds.length) {
        await prisma.studyMaterialBatch.createMany({
          data: itemIds.map((materialId) => ({ batchId, materialId })),
        });
      }
      return;
    }
    case "ASSIGNMENT": {
      await prisma.assignmentBatch.deleteMany({ where: { batchId } });
      if (itemIds.length) {
        await prisma.assignmentBatch.createMany({
          data: itemIds.map((assignmentId) => ({ batchId, assignmentId })),
        });
      }
      return;
    }
    case "CURRICULUM": {
      await prisma.curriculumBatch.deleteMany({ where: { batchId } });
      if (itemIds.length) {
        await prisma.curriculumBatch.createMany({
          data: itemIds.map((curriculumId) => ({ batchId, curriculumId })),
        });
      }
      return;
    }
  }
}
