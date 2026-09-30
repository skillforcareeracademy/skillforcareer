import { prisma } from "@/lib/prisma";
import { Prisma, type LeadStage } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { LEAD_STAGES, LEAD_STAGE_LABELS } from "@/lib/validations/lead";

/**
 * The academy's own pipeline.
 *
 * "Provide me an option to add, change and delete lead stages and status
 * dynamically." The nine stages that shipped are seeded as editable rows the
 * first time this is read; from then on they can be renamed, reordered, tinted,
 * switched off, or joined by new ones.
 *
 * Each stage still says which built-in it behaves like. That is what keeps the
 * rest of the CRM working through a rename: conversion counting, the reports
 * and the automation all read the built-in, while every screen shows the
 * academy's own word for it.
 */

export interface StageOption {
  id: string;
  key: string;
  name: string;
  order: number;
  color: string | null;
  isActive: boolean;
  isDefault: boolean;
  systemStage: LeadStage;
  statuses: { id: string; name: string; order: number; isActive: boolean }[];
}

/** Seed the built-ins once, so the academy has something to edit. */
async function ensureSeeded(): Promise<void> {
  const count = await prisma.leadStageOption.count();
  if (count > 0) return;
  await prisma.leadStageOption.createMany({
    data: LEAD_STAGES.map((key, i) => ({
      key,
      name: LEAD_STAGE_LABELS[key],
      order: i,
      systemStage: key as LeadStage,
      isDefault: key === "FRESH_LEAD",
    })),
  });
}

export async function listStages(includeInactive = true): Promise<StageOption[]> {
  await ensureSeeded();
  const rows = await prisma.leadStageOption.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: {
      statuses: {
        orderBy: [{ order: "asc" }, { name: "asc" }],
        select: { id: true, name: true, order: true, isActive: true },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    order: r.order,
    color: r.color,
    isActive: r.isActive,
    isDefault: r.isDefault,
    systemStage: r.systemStage,
    statuses: r.statuses,
  }));
}

/** A key nothing else is using — derived from the name, then made unique. */
async function freeKey(name: string): Promise<string> {
  const root =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "STAGE";
  for (let n = 0; n < 50; n += 1) {
    const key = n === 0 ? root : `${root}_${n + 1}`;
    const clash = await prisma.leadStageOption.findFirst({ where: { key }, select: { id: true } });
    if (!clash) return key;
  }
  throw AppError.badRequest("Couldn't find a free key for that stage.");
}

export async function createStage(input: {
  name: string;
  systemStage: LeadStage;
  color?: string | null;
}): Promise<string> {
  await ensureSeeded();
  const last = await prisma.leadStageOption.findFirst({
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const row = await prisma.leadStageOption.create({
    data: {
      key: await freeKey(input.name),
      name: input.name.trim(),
      systemStage: input.systemStage,
      color: input.color?.trim() || null,
      order: (last?.order ?? -1) + 1,
    },
    select: { id: true },
  });
  return row.id;
}

export async function updateStage(
  id: string,
  input: {
    name?: string;
    color?: string | null;
    isActive?: boolean;
    isDefault?: boolean;
    systemStage?: LeadStage;
  },
): Promise<void> {
  const existing = await prisma.leadStageOption.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Stage not found.");

  // Exactly one stage can be where new enquiries land.
  if (input.isDefault) {
    await prisma.leadStageOption.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  }
  await prisma.leadStageOption.update({
    where: { id },
    data: {
      ...(input.name === undefined ? {} : { name: input.name.trim() }),
      ...(input.color === undefined ? {} : { color: input.color?.trim() || null }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
      ...(input.systemStage === undefined ? {} : { systemStage: input.systemStage }),
    },
  });
}

/**
 * Remove a stage. The leads sitting in it are moved to whichever stage is
 * nominated — a stage cannot simply be deleted out from under them.
 */
export async function deleteStage(id: string, moveToId?: string): Promise<number> {
  const stage = await prisma.leadStageOption.findUnique({
    where: { id },
    select: { id: true, key: true, isDefault: true },
  });
  if (!stage) throw AppError.notFound("Stage not found.");
  if (stage.isDefault) {
    throw AppError.badRequest("That's where new enquiries land — make another the default first.");
  }

  const held = await prisma.lead.count({ where: { stageKey: stage.key } });
  if (held > 0) {
    const target = moveToId
      ? await prisma.leadStageOption.findUnique({
          where: { id: moveToId },
          select: { key: true, systemStage: true },
        })
      : null;
    if (!target) {
      throw AppError.badRequest(
        `${held} lead${held === 1 ? " is" : "s are"} in this stage — choose where to move them.`,
      );
    }
    await prisma.lead.updateMany({
      where: { stageKey: stage.key },
      data: { stageKey: target.key, stage: target.systemStage },
    });
  }
  await prisma.leadStageOption.delete({ where: { id } });
  return held;
}

export async function reorderStages(ids: string[]): Promise<number> {
  const rows = await prisma.leadStageOption.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const allowed = new Set(rows.map((r) => r.id));
  const ordered = ids.filter((id) => allowed.has(id));
  if (ordered.length === 0) return 0;
  const cases = ordered.map((id, i) => Prisma.sql`WHEN ${id} THEN ${i + 1}`);
  await prisma.$executeRaw`
    UPDATE \`LeadStageOption\`
    SET \`order\` = CASE id ${Prisma.join(cases, " ")} END,
        updatedAt = ${new Date()}
    WHERE id IN (${Prisma.join(ordered.map((id) => Prisma.sql`${id}`))})`;
  return ordered.length;
}

// ── Sub-statuses ────────────────────────────────────────────────────────────

export async function createStatus(input: {
  name: string;
  stageOptionId?: string | null;
}): Promise<string> {
  const last = await prisma.leadStatusOption.findFirst({
    where: { stageOptionId: input.stageOptionId || null },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const row = await prisma.leadStatusOption.create({
    data: {
      name: input.name.trim(),
      stageOptionId: input.stageOptionId || null,
      order: (last?.order ?? -1) + 1,
    },
    select: { id: true },
  });
  return row.id;
}

export async function updateStatus(
  id: string,
  input: { name?: string; isActive?: boolean },
): Promise<void> {
  const existing = await prisma.leadStatusOption.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Status not found.");
  await prisma.leadStatusOption.update({
    where: { id },
    data: {
      ...(input.name === undefined ? {} : { name: input.name.trim() }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    },
  });
}

/** The sub-status is free text on a lead, so removing an option changes nothing already recorded. */
export async function deleteStatus(id: string): Promise<void> {
  await prisma.leadStatusOption.delete({ where: { id } });
}

/** Every status the academy offers, whichever stage it belongs to. */
export async function listStatuses(): Promise<
  { id: string; name: string; stageOptionId: string | null; isActive: boolean }[]
> {
  return prisma.leadStatusOption.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true, name: true, stageOptionId: true, isActive: true },
  });
}
