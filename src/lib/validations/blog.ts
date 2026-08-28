import { z } from "zod";

/**
 * The blog.
 *
 * Added because the client went looking for one and it wasn't there ("also i
 * can not find blog system"). Deliberately small: a post is a title, a cover, a
 * body and a publish switch, plus the two meta fields an SEO-minded marketer
 * will ask for next. Anything more elaborate would be a CMS nobody asked for.
 */

export const POST_STATUSES = ["DRAFT", "PUBLISHED"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const POST_STATUS_LABEL: Record<PostStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
};

/** Roughly what a person reads in a minute, in words. */
const WORDS_PER_MINUTE = 200;

/** Estimate a post's reading time from its HTML body. Never less than a minute. */
export function readingMinutes(html: string): number {
  const words = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** `Medical Coding in 2026` → `medical-coding-in-2026`. */
export function slugifyTitle(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 120) || "post"
  );
}

const tagList = z
  .array(z.string().trim().min(1).max(40))
  .max(12)
  .default([])
  // A tag typed twice, or in two cases, is one tag.
  .transform((tags) => [...new Map(tags.map((t) => [t.toLowerCase(), t])).values()]);

export const blogPostSchema = z.object({
  title: z.string().trim().min(3, "Title is too short").max(180),
  slug: z
    .string()
    .trim()
    .max(120)
    .regex(/^[a-z0-9-]*$/, "Use lowercase letters, numbers and hyphens only")
    .default(""),
  excerpt: z.string().trim().max(400).default(""),
  content: z.string().trim().max(120_000).default(""),
  coverUrl: z.string().trim().max(500).default(""),
  status: z.enum(POST_STATUSES).default("DRAFT"),
  tags: tagList,
  categoryId: z.string().trim().max(40).default(""),
  metaTitle: z.string().trim().max(180).default(""),
  metaDescription: z.string().trim().max(400).default(""),
});

export type BlogPostInput = z.infer<typeof blogPostSchema>;

export const listBlogQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(POST_STATUSES).optional(),
  tag: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(20),
});

export type ListBlogQuery = z.infer<typeof listBlogQuerySchema>;
