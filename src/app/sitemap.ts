import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";

export const dynamic = "force-dynamic";

/**
 * Everything a search engine should know about.
 *
 * Built from the database rather than written out by hand: the academy adds
 * courses and articles weekly, and a list maintained in code is a list that is
 * out of date by the second week. Only published rows, and only the pages a
 * stranger can actually open — nothing behind a sign-in appears here, which
 * is the same line `robots.ts` draws.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url.replace(/\/$/, "");
  const now = new Date();

  const fixed: MetadataRoute.Sitemap = (
    [
      ["/", "daily", 1],
      ["/courses", "daily", 0.9],
      ["/webinars", "weekly", 0.7],
      ["/blog", "daily", 0.7],
      ["/careers", "weekly", 0.6],
      ["/about", "monthly", 0.5],
      ["/contact", "monthly", 0.5],
      ["/terms", "yearly", 0.2],
      ["/privacy", "yearly", 0.2],
    ] as const
  ).map(([path, changeFrequency, priority]) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));

  // A sitemap is worth having even when one of these reads fails, so each is
  // allowed to come back empty rather than take the whole file down.
  const [courses, posts, categories, webinars] = await Promise.all([
    prisma.course
      .findMany({
        where: { status: "PUBLISHED" },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 2000,
      })
      .catch(() => []),
    prisma.blogPost
      .findMany({
        where: { status: "PUBLISHED" },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 2000,
      })
      .catch(() => []),
    prisma.category
      .findMany({ select: { slug: true }, take: 300 })
      .catch(() => []),
    prisma.webinar
      .findMany({
        where: { isPublished: true },
        select: { slug: true, updatedAt: true },
        take: 500,
      })
      .catch(() => []),
  ]);

  return [
    ...fixed,
    ...courses.map((c) => ({
      url: `${base}/courses/${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...categories.map((c) => ({
      url: `${base}/courses?category=${c.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...posts.map((p) => ({
      url: `${base}/blog/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...webinars.map((w) => ({
      url: `${base}/webinars/${w.slug}`,
      lastModified: w.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}
