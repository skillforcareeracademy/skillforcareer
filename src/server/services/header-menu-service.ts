import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { clearMemo, readMemo, writeMemo } from "./memo";

/**
 * What the header's "Courses" and "Categories" dropdowns show.
 *
 * Deliberately not editable content: the client asked for the menus to *be* the
 * catalogue, so publishing a course puts it in the menu and unpublishing takes
 * it out. Which links carry a dropdown is still theirs to choose, under
 * Admin → Homepage → Header.
 */

export interface HeaderMenuCategory {
  name: string;
  slug: string;
  courseCount: number;
}

export interface HeaderMenuCourse {
  title: string;
  slug: string;
  categoryName: string | null;
}

export interface HeaderMenus {
  categories: HeaderMenuCategory[];
  courses: HeaderMenuCourse[];
}

/** Enough to fill two columns without turning the menu into the catalogue. */
const MAX_CATEGORIES = 10;
const MAX_COURSES = 10;

/**
 * The header runs on every public page and the database is a region away, so
 * the menus are held in process the same way the homepage content is.
 */
const MEMO_KEY = "header:menus";
const TTL_MS = 5 * 60_000;

/** Drop the memo after a course or category changes. */
export function invalidateHeaderMenus(): void {
  clearMemo(MEMO_KEY);
}

const EMPTY: HeaderMenus = { categories: [], courses: [] };

export const getHeaderMenus = cache(async (): Promise<HeaderMenus> => {
  const cached = readMemo<HeaderMenus>(MEMO_KEY);
  if (cached) return cached;

  try {
    const [cats, counts, courses] = await Promise.all([
      prisma.category.findMany({
        where: { isActive: true },
        orderBy: [{ order: "asc" }, { name: "asc" }],
        select: { id: true, name: true, slug: true },
      }),
      prisma.course.groupBy({
        by: ["categoryId"],
        where: { status: "PUBLISHED" },
        _count: { _all: true },
      }),
      prisma.course.findMany({
        where: { status: "PUBLISHED" },
        // Featured first, then whatever learners are actually buying — the same
        // order the catalogue's own "popular" listing uses.
        orderBy: [
          { isFeatured: "desc" },
          { enrollmentCount: "desc" },
          { createdAt: "desc" },
        ],
        take: MAX_COURSES,
        select: {
          title: true,
          slug: true,
          category: { select: { name: true } },
        },
      }),
    ]);

    const published = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    const value: HeaderMenus = {
      // An empty category in the menu is a dead end, so it doesn't go in.
      categories: cats
        .map((c) => ({
          name: c.name,
          slug: c.slug,
          courseCount: published.get(c.id) ?? 0,
        }))
        .filter((c) => c.courseCount > 0)
        .slice(0, MAX_CATEGORIES),
      courses: courses.map((c) => ({
        title: c.title,
        slug: c.slug,
        categoryName: c.category?.name ?? null,
      })),
    };

    writeMemo(MEMO_KEY, value, TTL_MS);
    return value;
  } catch {
    // The header must render even if this read fails — the links still work,
    // they just don't drop down. Not memoised, so the next request retries.
    return EMPTY;
  }
});
