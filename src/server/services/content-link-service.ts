import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";

/**
 * Content that belongs with other content.
 *
 * A chapter of reading, the quiz that tests it and the assignment that follows
 * are one thing to a learner and three rows to us. A link joins any two, and
 * is read in both directions — so linking the quiz to the chapter puts the
 * chapter on the quiz *and* the quiz on the chapter, which is the whole point.
 *
 * Only these three can be joined today; the column is the wider `GroupKind`,
 * so adding curriculums later needs no migration.
 */

export const LINKABLE_KINDS = ["QUIZ", "MATERIAL", "ASSIGNMENT"] as const;
export type LinkableKind = (typeof LINKABLE_KINDS)[number];

export const LINKABLE_LABEL: Record<LinkableKind, string> = {
  QUIZ: "Quiz",
  MATERIAL: "Study material",
  ASSIGNMENT: "Assignment",
};

export interface LinkedItem {
  /** The link row, so it can be removed. */
  linkId: string;
  kind: LinkableKind;
  id: string;
  title: string;
  subtitle: string | null;
}

function isLinkable(kind: string): kind is LinkableKind {
  return (LINKABLE_KINDS as readonly string[]).includes(kind);
}

/** Titles for a set of ids of one kind, in one read each. */
async function titlesFor(
  kind: LinkableKind,
  ids: string[],
): Promise<Map<string, { title: string; subtitle: string | null }>> {
  const out = new Map<string, { title: string; subtitle: string | null }>();
  if (ids.length === 0) return out;

  if (kind === "QUIZ") {
    const rows = await prisma.quiz.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true, course: { select: { title: true } } },
    });
    rows.forEach((r) => out.set(r.id, { title: r.title, subtitle: r.course?.title ?? null }));
  } else if (kind === "MATERIAL") {
    const rows = await prisma.studyMaterial.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true, course: { select: { title: true } } },
    });
    rows.forEach((r) => out.set(r.id, { title: r.title, subtitle: r.course?.title ?? null }));
  } else {
    const rows = await prisma.assignment.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true, course: { select: { title: true } } },
    });
    rows.forEach((r) => out.set(r.id, { title: r.title, subtitle: r.course?.title ?? null }));
  }
  return out;
}

/**
 * Everything joined to one piece, whichever end the link was made from.
 * Items that have since been deleted are left out rather than shown as blanks.
 */
export async function linkedTo(kind: LinkableKind, id: string): Promise<LinkedItem[]> {
  const rows = await prisma.contentLink.findMany({
    where: {
      OR: [
        { fromKind: kind, fromId: id },
        { toKind: kind, toId: id },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  // Whichever end is not the one asked about is the one to show.
  const others = rows.map((r) => {
    const mine = r.fromKind === kind && r.fromId === id;
    return {
      linkId: r.id,
      kind: (mine ? r.toKind : r.fromKind) as string,
      id: mine ? r.toId : r.fromId,
    };
  });

  const byKind = new Map<LinkableKind, string[]>();
  for (const o of others) {
    if (!isLinkable(o.kind)) continue;
    byKind.set(o.kind, [...(byKind.get(o.kind) ?? []), o.id]);
  }
  const titles = new Map<string, { title: string; subtitle: string | null }>();
  await Promise.all(
    [...byKind.entries()].map(async ([k, ids]) => {
      const found = await titlesFor(k, ids);
      found.forEach((v, key) => titles.set(`${k}:${key}`, v));
    }),
  );

  return others.flatMap((o) => {
    if (!isLinkable(o.kind)) return [];
    const found = titles.get(`${o.kind}:${o.id}`);
    if (!found) return []; // deleted since it was linked
    return [{ linkId: o.linkId, kind: o.kind, id: o.id, ...found }];
  });
}

/** Join two pieces. Linking the same pair twice is a no-op, either way round. */
export async function linkContent(
  fromKind: LinkableKind,
  fromId: string,
  toKind: LinkableKind,
  toId: string,
  createdById: string,
): Promise<string> {
  if (fromKind === toKind && fromId === toId) {
    throw AppError.badRequest("That is the same item.");
  }
  const already = await prisma.contentLink.findFirst({
    where: {
      OR: [
        { fromKind, fromId, toKind, toId },
        { fromKind: toKind, fromId: toId, toKind: fromKind, toId: fromId },
      ],
    },
    select: { id: true },
  });
  if (already) return already.id;

  const made = await prisma.contentLink.create({
    data: { fromKind, fromId, toKind, toId, createdById },
    select: { id: true },
  });
  return made.id;
}

export async function unlinkContent(linkId: string): Promise<void> {
  const { count } = await prisma.contentLink.deleteMany({ where: { id: linkId } });
  if (count === 0) throw AppError.notFound("That link is already gone.");
}

/** What can be linked to, for the picker. */
export async function linkableOptions(
  kind: LinkableKind,
  search: string,
): Promise<{ id: string; title: string; subtitle: string | null }[]> {
  const where = search.trim() ? { title: { contains: search.trim() } } : {};
  const take = 50;
  if (kind === "QUIZ") {
    const rows = await prisma.quiz.findMany({
      where, take, orderBy: { title: "asc" },
      select: { id: true, title: true, course: { select: { title: true } } },
    });
    return rows.map((r) => ({ id: r.id, title: r.title, subtitle: r.course?.title ?? null }));
  }
  if (kind === "MATERIAL") {
    const rows = await prisma.studyMaterial.findMany({
      where, take, orderBy: { title: "asc" },
      select: { id: true, title: true, course: { select: { title: true } } },
    });
    return rows.map((r) => ({ id: r.id, title: r.title, subtitle: r.course?.title ?? null }));
  }
  const rows = await prisma.assignment.findMany({
    where, take, orderBy: { title: "asc" },
    select: { id: true, title: true, course: { select: { title: true } } },
  });
  return rows.map((r) => ({ id: r.id, title: r.title, subtitle: r.course?.title ?? null }));
}

/** Narrow a string from a URL, or refuse it. */
export function asLinkable(raw: string | null): LinkableKind {
  if (raw && isLinkable(raw)) return raw;
  throw AppError.badRequest("That kind of content can't be linked.");
}
