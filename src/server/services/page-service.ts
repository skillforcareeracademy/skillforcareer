import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { clearMemo, readMemo, writeMemo } from "./memo";
import {
  parseSectionData,
  validateSectionData,
  type AnyField,
} from "@/lib/validations/homepage";
import {
  PAGE_SECTIONS,
  PAGE_SECTION_KEYS,
  isPageSectionAlwaysOn,
  type PageData,
  type PageSectionKey,
} from "@/lib/validations/pages";

/**
 * Content for the secondary pages — About us, Contact, For business and Live
 * classes — read from `PageSection` and merged over the shipped defaults.
 *
 * The same contract as the homepage's: a section with no row yet still renders
 * from its defaults, so every page looks right before anyone opens the editor,
 * and saving is what creates the row.
 */

export type PageSection = {
  [K in PageSectionKey]: {
    key: K;
    enabled: boolean;
    order: number;
    data: PageData<K>;
    updatedAt: string | null;
    customised: boolean;
  };
}[PageSectionKey];

const MEMO_KEY = "pages:sections";
const TTL_MS = 60_000;

export function invalidatePages(): void {
  clearMemo(MEMO_KEY);
}

type StoredRow = {
  key: string;
  enabled: boolean;
  order: number;
  data: unknown;
  updatedAt: Date;
};

function build(rows: StoredRow[]): PageSection[] {
  const stored = new Map(rows.map((r) => [r.key, r]));

  return PAGE_SECTION_KEYS.map((key, shipped) => {
    const row = stored.get(key);
    const spec = PAGE_SECTIONS[key];
    return {
      key,
      enabled: isPageSectionAlwaysOn(key) ? true : (row?.enabled ?? true),
      order: row?.order ?? shipped,
      data: parseSectionData(spec, row?.data),
      updatedAt: row?.updatedAt.toISOString() ?? null,
      customised: row != null,
    } as PageSection;
  }).sort((a, b) => a.order - b.order);
}

export const getPageSections = cache(async (): Promise<PageSection[]> => {
  const cached = readMemo<PageSection[]>(MEMO_KEY);
  if (cached) return cached;
  try {
    const rows = await prisma.pageSection.findMany({
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
export async function getPageSection<K extends PageSectionKey>(
  key: K,
): Promise<Extract<PageSection, { key: K }>> {
  const sections = await getPageSections();
  const found = sections.find((s) => s.key === key);
  return found as Extract<PageSection, { key: K }>;
}

/** Several at once, still on the one read. */
export async function getPageSectionsFor<K extends PageSectionKey>(
  keys: readonly K[],
): Promise<{ [P in K]: Extract<PageSection, { key: P }> }> {
  const sections = await getPageSections();
  const byKey = new Map(sections.map((s) => [s.key, s]));
  return Object.fromEntries(keys.map((k) => [k, byKey.get(k)])) as {
    [P in K]: Extract<PageSection, { key: P }>;
  };
}

/**
 * Save a section's content and/or its visibility.
 *
 * Strict, for the same reason the homepage's save is: silently substituting
 * defaults for something the admin typed is how a whole rewritten section comes
 * back as the original copy.
 */
export async function updatePageSection(
  key: PageSectionKey,
  input: { enabled?: boolean; data?: Record<string, unknown> },
  updatedById: string,
): Promise<PageSection> {
  const current = await getPageSection(key);
  const spec = PAGE_SECTIONS[key];

  let data: unknown = current.data;
  if (input.data) {
    const result = validateSectionData(
      { schema: spec.schema, fields: spec.fields as readonly AnyField[] },
      { ...current.data, ...input.data },
    );
    if (!result.success) {
      const [first] = result.issues;
      throw AppError.badRequest(
        `Couldn't save ${spec.label}: ${first.label} — ${first.message.toLowerCase()}.`,
        { issues: result.issues },
      );
    }
    data = result.data;
  }

  const enabled = isPageSectionAlwaysOn(key) ? true : (input.enabled ?? current.enabled);

  await prisma.pageSection.upsert({
    where: { key },
    create: { key, enabled, order: current.order, data: data as object, updatedById },
    update: { enabled, data: data as object, updatedById },
  });

  invalidatePages();
  return { ...current, enabled, data, customised: true } as PageSection;
}

/** Drop a section's edits and go back to the content the site shipped with. */
export async function resetPageSection(
  key: PageSectionKey,
  updatedById: string,
): Promise<PageSection> {
  const defaults = PAGE_SECTIONS[key].defaults;
  await prisma.pageSection.upsert({
    where: { key },
    create: { key, data: defaults as object, updatedById },
    update: { data: defaults as object, updatedById },
  });
  invalidatePages();
  return getPageSection(key);
}
