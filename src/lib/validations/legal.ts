import { z } from "zod";

/**
 * The legal / policy pages as editable content.
 *
 * "Jitni bhi policy ke pages hain, admin panel se content update kar sakein."
 * Unlike the homepage and the About/Contact pages — which are a fixed set of
 * typed bands — a policy document is one flowing piece of text, so each page is
 * a single rich-HTML `body` plus the three header fields the public page shows.
 *
 * Client-safe: the admin editor imports this in the browser, so nothing here
 * may reach for the database.
 */

/** A legal page: its route slug (also the DB key) and how it's labelled. */
export const LEGAL_PAGES = [
  { key: "privacy", label: "Privacy policy", href: "/privacy" },
  { key: "terms", label: "Terms of use", href: "/terms" },
  { key: "cookies", label: "Cookie policy", href: "/cookies" },
] as const;

export type LegalPageKey = (typeof LEGAL_PAGES)[number]["key"];

export const LEGAL_PAGE_KEYS = LEGAL_PAGES.map((p) => p.key) as LegalPageKey[];

export function isLegalPageKey(value: string): value is LegalPageKey {
  return LEGAL_PAGE_KEYS.includes(value as LegalPageKey);
}

export function legalPageLabel(key: LegalPageKey): string {
  return LEGAL_PAGES.find((p) => p.key === key)?.label ?? key;
}

/** What the admin may change. The body is the editor's HTML output. */
export const saveLegalPageSchema = z.object({
  title: z.string().trim().min(1, "Give the page a title").max(150),
  intro: z.string().trim().max(1000).default(""),
  /** The "Last updated: …" line, free text so an admin can date it however. */
  updatedLabel: z.string().trim().max(80).default(""),
  /** Rich HTML from the editor — the same budget the blog body gets. */
  body: z.string().trim().max(200_000).default(""),
});

export type SaveLegalPageInput = z.infer<typeof saveLegalPageSchema>;

/** The shape the admin editor and the public page both read. */
export interface LegalPageContent {
  key: LegalPageKey;
  title: string;
  intro: string;
  updatedLabel: string;
  body: string;
  /** False when the page is still the copy shipped in code, never saved. */
  edited: boolean;
}
