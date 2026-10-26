import { prisma } from "@/lib/prisma";
import {
  LEGAL_PAGE_KEYS,
  legalPageLabel,
  type LegalPageContent,
  type LegalPageKey,
  type SaveLegalPageInput,
} from "@/lib/validations/legal";

/**
 * Reading and writing the editable legal pages.
 *
 * A page the admin has never touched has no row; the public page then renders
 * the copy that shipped in code, and the admin editor shows a blank slate for
 * it. In practice all three are seeded from the shipped copy (scripts/seed-legal
 * .ts), so a row is almost always present.
 */

function toContent(row: {
  key: string;
  title: string;
  intro: string;
  updatedLabel: string;
  body: string;
}): LegalPageContent {
  return {
    key: row.key as LegalPageKey,
    title: row.title,
    intro: row.intro,
    updatedLabel: row.updatedLabel,
    body: row.body,
    edited: true,
  };
}

/** One page's stored content, or null when it has never been saved. */
export async function getLegalPage(
  key: LegalPageKey,
): Promise<LegalPageContent | null> {
  const row = await prisma.legalPage.findUnique({ where: { key } });
  return row ? toContent(row) : null;
}

/**
 * Every legal page for the admin editor — a stored row where there is one, and
 * an empty placeholder (so the page still appears in the list) where there
 * isn't.
 */
export async function listLegalPages(): Promise<LegalPageContent[]> {
  const rows = await prisma.legalPage.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return LEGAL_PAGE_KEYS.map((key) => {
    const row = byKey.get(key);
    return row
      ? toContent(row)
      : {
          key,
          title: legalPageLabel(key),
          intro: "",
          updatedLabel: "",
          body: "",
          edited: false,
        };
  });
}

/** Save an admin's edits to a legal page. */
export async function saveLegalPage(
  key: LegalPageKey,
  input: SaveLegalPageInput,
  userId: string,
): Promise<LegalPageContent> {
  const data = {
    title: input.title,
    intro: input.intro,
    updatedLabel: input.updatedLabel,
    body: input.body,
    updatedById: userId,
  };
  const row = await prisma.legalPage.upsert({
    where: { key },
    create: { key, ...data },
    update: data,
  });
  return toContent(row);
}

/**
 * Pull the `<h2>` headings out of a stored body and give each a stable id, so
 * the public page can keep its "On this page" rail and anchor links without the
 * admin having to think about ids. Returns the body with ids injected plus the
 * rail entries, in document order.
 */
export function withHeadingAnchors(body: string): {
  html: string;
  rail: { id: string; label: string }[];
} {
  const rail: { id: string; label: string }[] = [];
  const used = new Set<string>();

  const html = body.replace(
    /<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi,
    (_match, attrs: string, inner: string) => {
      const label = inner.replace(/<[^>]+>/g, "").trim();
      if (!label) return `<h2${attrs}>${inner}</h2>`;
      let id = slugify(label);
      let n = 2;
      while (used.has(id)) id = `${slugify(label)}-${n++}`;
      used.add(id);
      rail.push({ id, label });
      // Keep any id the author already set; otherwise add ours.
      const withId = /\bid=/.test(attrs) ? attrs : `${attrs} id="${id}"`;
      return `<h2${withId}>${inner}</h2>`;
    },
  );

  return { html, rail };
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "section"
  );
}
