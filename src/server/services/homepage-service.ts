import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { clearMemo, readMemo, writeMemo } from "./memo";
import {
  HOME_SECTIONS,
  HOME_SECTION_KEYS,
  isAlwaysOn,
  parseHomeData,
  validateHomeData,
  type HomeData,
  type HomeSectionKey,
} from "@/lib/validations/homepage";

/**
 * Homepage content, read from `HomeSection` and merged over the shipped
 * defaults in `lib/validations/homepage`.
 *
 * A section with no row yet still renders — the defaults *are* the designed
 * page, so a fresh install (or a section added in a later release) looks right
 * before anyone opens the editor. Saving is what creates the row.
 */

/** One section as the marketing page and the admin editor both consume it. */
export type HomeSection = {
  [K in HomeSectionKey]: {
    key: K;
    enabled: boolean;
    order: number;
    data: HomeData<K>;
    updatedAt: string | null;
    /** False until an admin has saved this section at least once. */
    customised: boolean;
  };
}[HomeSectionKey];

/**
 * The homepage is the site's busiest page and the database is a region away, so
 * the whole thing is held in process for a short window and dropped explicitly
 * on save — the same trade the branding lookup makes.
 */
const MEMO_KEY = "homepage:sections";
const TTL_MS = 60_000;

/** Drop the memo so an Admin → Homepage save shows up on the very next request. */
export function invalidateHomepage(): void {
  clearMemo(MEMO_KEY);
}

type StoredRow = {
  key: string;
  enabled: boolean;
  order: number;
  data: unknown;
  updatedAt: Date;
};

function build(rows: StoredRow[]): HomeSection[] {
  const stored = new Map(rows.map((r) => [r.key, r]));

  return HOME_SECTION_KEYS.map((key, shipped) => {
    const row = stored.get(key);
    return {
      key,
      // The header and footer are editable but never hideable, whatever an old
      // row or a hand-rolled API call says.
      enabled: isAlwaysOn(key) ? true : (row?.enabled ?? true),
      // Shipped position doubles as the fallback order, so a section that has
      // never been saved sits where the design put it rather than at the top.
      order: row?.order ?? shipped,
      data: parseHomeData(key, row?.data),
      updatedAt: row?.updatedAt.toISOString() ?? null,
      customised: row != null,
    } as HomeSection;
  }).sort((a, b) => a.order - b.order);
}

/**
 * Every section, in display order — enabled and disabled alike, because the
 * admin list needs both. Deduped per request and memoised across requests; a
 * database hiccup falls back to the shipped defaults rather than blanking the
 * homepage.
 */
export const getHomeSections = cache(async (): Promise<HomeSection[]> => {
  const cached = readMemo<HomeSection[]>(MEMO_KEY);
  if (cached) return cached;
  try {
    const rows = await prisma.homeSection.findMany({
      select: { key: true, enabled: true, order: true, data: true, updatedAt: true },
    });
    const value = build(rows);
    writeMemo(MEMO_KEY, value, TTL_MS);
    return value;
  } catch {
    return build([]); // not memoised — retry on the next request
  }
});

/** One section's content, sharing the single read above. */
export async function getHomeSection<K extends HomeSectionKey>(
  key: K,
): Promise<Extract<HomeSection, { key: K }>> {
  const sections = await getHomeSections();
  const found = sections.find((s) => s.key === key);
  return found as Extract<HomeSection, { key: K }>;
}

/** Save a section's content and/or its visibility. */
export async function updateHomeSection(
  key: HomeSectionKey,
  input: { enabled?: boolean; data?: Record<string, unknown> },
  updatedById: string,
): Promise<HomeSection> {
  const current = await getHomeSection(key);

  // Validate against the section's own schema before it reaches the database,
  // so a stale editor tab can't write a shape the marketing page can't render.
  //
  // Strictly, and this matters: the lenient read-path parse used to run here
  // too, and it answers "unreadable" with the *shipped defaults*. A single
  // over-long line therefore threw away every other edit in the section and
  // reported success — which is exactly how a fully rewritten footer came back
  // as the original copy. A save now either stores what was typed or says which
  // field it could not store.
  let data = current.data;
  if (input.data) {
    const result = validateHomeData(key, { ...current.data, ...input.data });
    if (!result.success) {
      const [first] = result.issues;
      throw AppError.badRequest(
        `Couldn't save ${HOME_SECTIONS[key].label}: ${first.label} — ${first.message.toLowerCase()}.`,
        { issues: result.issues },
      );
    }
    data = result.data;
  }

  const enabled = isAlwaysOn(key) ? true : (input.enabled ?? current.enabled);

  await prisma.homeSection.upsert({
    where: { key },
    create: { key, enabled, order: current.order, data, updatedById },
    update: { enabled, data, updatedById },
  });

  invalidateHomepage();
  return { ...current, enabled, data, customised: true } as HomeSection;
}

/**
 * Put the sections in the given top-to-bottom order.
 *
 * Only the rows that actually move are written. That matters: the database is
 * not in the app's region, and an `upsert` is two round-trips, so rewriting all
 * fourteen positions took ~8s and blew straight through the interactive
 * transaction budget. Moving a section is a one-place swap, which is two rows.
 */
export async function reorderHomeSections(
  keys: HomeSectionKey[],
  updatedById: string,
): Promise<void> {
  const current = await getHomeSections();
  const byKey = new Map(current.map((s) => [s.key, s]));
  const currentKeys = current.map((s) => s.key);

  const writes = keys.flatMap((key, position) => {
    const section = byKey.get(key);
    if (!section || currentKeys[position] === key) return [];
    return [
      // A row that already exists only needs its position changed, and
      // `updateMany` is a single statement where `upsert` would be two.
      section.customised
        ? prisma.homeSection.updateMany({ where: { key }, data: { order: position } })
        : prisma.homeSection.create({
            data: {
              key,
              order: position,
              enabled: section.enabled,
              data: section.data,
              updatedById,
            },
          }),
    ];
  });

  if (writes.length === 0) return;
  // Generous ceiling for the rare full reshuffle the API allows but the UI
  // never sends; the two-row common case finishes well inside it.
  await prisma.$transaction(writes, { timeout: 30_000 });

  invalidateHomepage();
}

/**
 * Drop a section's edits and go back to the content the site shipped with.
 * Position and visibility survive — resetting the copy shouldn't quietly move
 * the band back up the page or switch it on again.
 */
export async function resetHomeSection(
  key: HomeSectionKey,
  updatedById: string,
): Promise<HomeSection> {
  const defaults = HOME_SECTIONS[key].defaults;
  await prisma.homeSection.updateMany({
    where: { key },
    data: { data: defaults, updatedById },
  });
  invalidateHomepage();
  return getHomeSection(key);
}
