import { prisma } from "@/lib/prisma";
import { Prisma, type GroupKind } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";

/**
 * The academy's filing system.
 *
 * One tree per library — quizzes, study material, curriculums, assignments,
 * batches, certificates, discussions — nested as deep as the academy wants, and
 * an item may sit in more than one folder. Everything here is written once and
 * used by all seven, which is why nothing in this file knows what a quiz is.
 *
 * Two rules keep it honest. A folder can never be moved inside itself (the
 * service walks the ancestors before reparenting), and deleting a folder takes
 * its sub-folders with it while leaving the things filed in them alone —
 * un-filed, never deleted.
 */

export const GROUP_KINDS = [
  "QUIZ",
  "MATERIAL",
  "CURRICULUM",
  "ASSIGNMENT",
  "BATCH",
  "CERTIFICATE",
  "DISCUSSION",
] as const;

/** What each library is called on screen. */
export const GROUP_KIND_LABEL: Record<GroupKind, { one: string; many: string; href: string }> = {
  QUIZ: { one: "quiz", many: "quizzes", href: "/quizzes" },
  MATERIAL: { one: "item", many: "study material", href: "/materials" },
  CURRICULUM: { one: "curriculum", many: "curriculums", href: "/curriculum" },
  ASSIGNMENT: { one: "assignment", many: "assignments", href: "/assignments" },
  BATCH: { one: "batch", many: "batches", href: "/batches" },
  CERTIFICATE: { one: "certificate", many: "certificates", href: "/certificates" },
  DISCUSSION: { one: "discussion", many: "discussions", href: "/discussions" },
};

export interface GroupNode {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  order: number;
  /** Items filed directly in this folder. */
  count: number;
  /** Items in this folder and every folder beneath it. */
  totalCount: number;
  /** How deep it sits — 0 for a top-level folder. */
  depth: number;
  /** "Anatomy → Upper limb → Humerus". */
  path: string;
  children: GroupNode[];
}

interface Row {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  order: number;
}

/** The whole tree for one library, with the counts a screen needs. */
export async function groupTree(kind: GroupKind): Promise<GroupNode[]> {
  const [rows, counts] = await Promise.all([
    prisma.contentGroup.findMany({
      where: { kind },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true, description: true, parentId: true, order: true },
    }),
    prisma.contentGroupItem.groupBy({ by: ["groupId"], where: { kind }, _count: { _all: true } }),
  ]);

  const direct = new Map(counts.map((c) => [c.groupId, c._count._all]));
  const byParent = new Map<string | null, Row[]>();
  for (const r of rows) {
    const list = byParent.get(r.parentId) ?? [];
    list.push(r);
    byParent.set(r.parentId, list);
  }

  const build = (parentId: string | null, depth: number, prefix: string): GroupNode[] =>
    (byParent.get(parentId) ?? []).map((r) => {
      const path = prefix ? `${prefix} → ${r.name}` : r.name;
      const children = build(r.id, depth + 1, path);
      const count = direct.get(r.id) ?? 0;
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        parentId: r.parentId,
        order: r.order,
        count,
        totalCount: count + children.reduce((s, c) => s + c.totalCount, 0),
        depth,
        path,
        children,
      };
    });

  return build(null, 0, "");
}

/** The same tree flattened, for a picker: every folder with its full path. */
export interface GroupOption {
  id: string;
  name: string;
  path: string;
  depth: number;
  parentId: string | null;
  count: number;
}

export async function groupOptions(kind: GroupKind): Promise<GroupOption[]> {
  const flatten = (nodes: GroupNode[]): GroupOption[] =>
    nodes.flatMap((n) => [
      { id: n.id, name: n.name, path: n.path, depth: n.depth, parentId: n.parentId, count: n.totalCount },
      ...flatten(n.children),
    ]);
  return flatten(await groupTree(kind));
}

/** Every ancestor of a folder, nearest first — what a move is checked against. */
async function ancestorsOf(groupId: string): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | null = groupId;
  // A tree this shallow will never reach the guard; it is here so a corrupted
  // parent chain cannot hang the request.
  for (let hops = 0; cursor && hops < 50; hops += 1) {
    const row: { parentId: string | null } | null = await prisma.contentGroup.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = row?.parentId ?? null;
    if (cursor) out.push(cursor);
  }
  return out;
}

export async function createGroup(input: {
  kind: GroupKind;
  name: string;
  parentId?: string | null;
  description?: string | null;
}): Promise<string> {
  const parentId = input.parentId || null;
  if (parentId) {
    const parent = await prisma.contentGroup.findUnique({
      where: { id: parentId },
      select: { kind: true },
    });
    if (!parent) throw AppError.notFound("That group no longer exists.");
    if (parent.kind !== input.kind) {
      throw AppError.badRequest("A group can only sit inside one of its own kind.");
    }
  }
  await assertNameFree(input.kind, input.name, parentId);

  const last = await prisma.contentGroup.findFirst({
    where: { kind: input.kind, parentId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const row = await prisma.contentGroup.create({
    data: {
      kind: input.kind,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      parentId,
      order: (last?.order ?? -1) + 1,
    },
    select: { id: true },
  });
  return row.id;
}

async function assertNameFree(
  kind: GroupKind,
  name: string,
  parentId: string | null,
  exceptId?: string,
) {
  const clash = await prisma.contentGroup.findFirst({
    where: {
      kind,
      parentId,
      name: name.trim(),
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw AppError.conflict("A group of that name already sits here.");
}

export async function updateGroup(
  id: string,
  input: { name?: string; description?: string | null; parentId?: string | null },
): Promise<void> {
  const existing = await prisma.contentGroup.findUnique({
    where: { id },
    select: { kind: true, name: true, parentId: true },
  });
  if (!existing) throw AppError.notFound("Group not found.");

  const parentId =
    input.parentId === undefined ? existing.parentId : input.parentId || null;

  // A folder cannot be moved inside itself, nor inside anything it contains.
  if (parentId && parentId !== existing.parentId) {
    if (parentId === id) throw AppError.badRequest("A group can't sit inside itself.");
    const ancestors = await ancestorsOf(parentId);
    if (ancestors.includes(id)) {
      throw AppError.badRequest("A group can't be moved inside one of its own sub-groups.");
    }
    const parent = await prisma.contentGroup.findUnique({
      where: { id: parentId },
      select: { kind: true },
    });
    if (parent?.kind !== existing.kind) {
      throw AppError.badRequest("A group can only sit inside one of its own kind.");
    }
  }

  const name = input.name?.trim() || existing.name;
  if (name !== existing.name || parentId !== existing.parentId) {
    await assertNameFree(existing.kind, name, parentId, id);
  }

  await prisma.contentGroup.update({
    where: { id },
    data: {
      name,
      parentId,
      ...(input.description === undefined
        ? {}
        : { description: input.description?.trim() || null }),
    },
  });
}

/**
 * Delete a folder and everything under it. What was filed inside is un-filed,
 * never deleted — the same rule the old per-module categories followed.
 */
export async function deleteGroup(id: string): Promise<number> {
  const existing = await prisma.contentGroup.findUnique({
    where: { id },
    select: { id: true, kind: true },
  });
  if (!existing) throw AppError.notFound("Group not found.");

  // Collect the subtree, deepest first.
  const doomed: string[] = [];
  const walk = async (parentId: string) => {
    const kids = await prisma.contentGroup.findMany({
      where: { parentId },
      select: { id: true },
    });
    for (const k of kids) await walk(k.id);
    doomed.push(parentId);
  };
  await walk(id);

  await prisma.contentGroupItem.deleteMany({ where: { groupId: { in: doomed } } });
  await prisma.batchGroupAccess.deleteMany({ where: { groupId: { in: doomed } } });
  // Leaves first: with NoAction on the self-relation, deleting a parent that
  // still has a child is rejected (P2014).
  for (const groupId of doomed) {
    await prisma.contentGroup.delete({ where: { id: groupId } });
  }
  return doomed.length;
}

/** Put a folder's siblings in a given order. */
export async function reorderGroups(ids: string[]): Promise<number> {
  const rows = await prisma.contentGroup.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const allowed = new Set(rows.map((r) => r.id));
  const ordered = ids.filter((id) => allowed.has(id));
  if (ordered.length === 0) return 0;

  const cases = ordered.map((id, i) => Prisma.sql`WHEN ${id} THEN ${i + 1}`);
  await prisma.$executeRaw`
    UPDATE \`ContentGroup\`
    SET \`order\` = CASE id ${Prisma.join(cases, " ")} END,
        updatedAt = ${new Date()}
    WHERE id IN (${Prisma.join(ordered.map((id) => Prisma.sql`${id}`))})`;
  return ordered.length;
}

// ── Membership ──────────────────────────────────────────────────────────────

/** Which folders one item sits in. */
export async function groupsOf(kind: GroupKind, itemId: string): Promise<string[]> {
  const rows = await prisma.contentGroupItem.findMany({
    where: { kind, itemId },
    select: { groupId: true },
  });
  return rows.map((r) => r.groupId);
}

/** The folders for a set of items, in one read rather than one each. */
export async function groupsOfMany(
  kind: GroupKind,
  itemIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (itemIds.length === 0) return out;
  const rows = await prisma.contentGroupItem.findMany({
    where: { kind, itemId: { in: itemIds } },
    select: { itemId: true, groupId: true },
  });
  for (const r of rows) {
    out.set(r.itemId, [...(out.get(r.itemId) ?? []), r.groupId]);
  }
  return out;
}

/** Replace the folders an item sits in. The picker's choices are the truth. */
export async function setGroupsFor(
  kind: GroupKind,
  itemId: string,
  groupIds: string[],
): Promise<void> {
  const wanted = [...new Set(groupIds.filter(Boolean))];
  await prisma.contentGroupItem.deleteMany({ where: { kind, itemId } });
  if (wanted.length === 0) return;

  // Only folders of the right library, so a stale picker can't file a quiz
  // under a study-material folder.
  const valid = await prisma.contentGroup.findMany({
    where: { id: { in: wanted }, kind },
    select: { id: true },
  });
  if (valid.length === 0) return;
  await prisma.contentGroupItem.createMany({
    data: valid.map((g) => ({ groupId: g.id, itemId, kind })),
  });
}

/** Everything filed in a folder or any folder beneath it. */
export async function itemsInGroups(
  kind: GroupKind,
  groupIds: string[],
): Promise<string[]> {
  if (groupIds.length === 0) return [];
  const all = await prisma.contentGroup.findMany({
    where: { kind },
    select: { id: true, parentId: true },
  });
  const childrenOf = new Map<string, string[]>();
  for (const g of all) {
    if (!g.parentId) continue;
    childrenOf.set(g.parentId, [...(childrenOf.get(g.parentId) ?? []), g.id]);
  }
  const reach = new Set<string>();
  const walk = (id: string) => {
    if (reach.has(id)) return;
    reach.add(id);
    for (const child of childrenOf.get(id) ?? []) walk(child);
  };
  for (const id of groupIds) walk(id);

  const rows = await prisma.contentGroupItem.findMany({
    where: { kind, groupId: { in: [...reach] } },
    select: { itemId: true },
  });
  return [...new Set(rows.map((r) => r.itemId))];
}

/** Forget an item's filing — called when the item itself is deleted. */
export async function forgetItem(kind: GroupKind, itemId: string): Promise<void> {
  await prisma.contentGroupItem.deleteMany({ where: { kind, itemId } });
}

// ── What a cohort has been given ────────────────────────────────────────────

/** The folders a batch has been handed, for one library. */
export async function batchGroups(batchId: string, kind: GroupKind): Promise<string[]> {
  const rows = await prisma.batchGroupAccess.findMany({
    where: { batchId, group: { kind } },
    select: { groupId: true },
  });
  return rows.map((r) => r.groupId);
}

/** Replace the folders a batch has been handed, for one library. */
export async function setBatchGroups(
  batchId: string,
  kind: GroupKind,
  groupIds: string[],
): Promise<void> {
  const wanted = [...new Set(groupIds.filter(Boolean))];
  await prisma.batchGroupAccess.deleteMany({
    where: { batchId, group: { kind } },
  });
  if (wanted.length === 0) return;
  const valid = await prisma.contentGroup.findMany({
    where: { id: { in: wanted }, kind },
    select: { id: true },
  });
  if (valid.length === 0) return;
  await prisma.batchGroupAccess.createMany({
    data: valid.map((g) => ({ batchId, groupId: g.id })),
  });
}

/**
 * Everything a set of cohorts has been given through folders.
 *
 * This is what makes "assign the folder, not the papers" work: a quiz added to
 * the folder tomorrow is already assigned to every batch holding it.
 */
export async function itemsForBatches(
  batchIds: string[],
  kind: GroupKind,
): Promise<string[]> {
  if (batchIds.length === 0) return [];
  const rows = await prisma.batchGroupAccess.findMany({
    where: { batchId: { in: batchIds }, group: { kind } },
    select: { groupId: true },
  });
  return itemsInGroups(kind, [...new Set(rows.map((r) => r.groupId))]);
}
