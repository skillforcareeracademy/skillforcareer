import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import {
  readingMinutes,
  slugifyTitle,
  type BlogPostInput,
  type ListBlogQuery,
} from "@/lib/validations/blog";

/**
 * The blog — admin CRUD, and the two public reads behind /blog.
 *
 * Bodies are HTML from the editor and can run to tens of kilobytes, so list
 * reads never select `content`: the catalogue page would otherwise pull every
 * post's full text across a connection that is a region away.
 */

export interface BlogPostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverUrl: string;
  status: string;
  tags: string[];
  categoryId: string;
  categoryName: string | null;
  authorName: string | null;
  publishedAt: string | null;
  readMinutes: number;
  views: number;
  updatedAt: string;
}

export interface BlogPostDetail extends BlogPostRow {
  content: string;
  metaTitle: string;
  metaDescription: string;
}

const LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  coverUrl: true,
  status: true,
  tags: true,
  categoryId: true,
  publishedAt: true,
  readMinutes: true,
  views: true,
  updatedAt: true,
  category: { select: { name: true } },
  author: { select: { name: true } },
} satisfies Prisma.BlogPostSelect;

type ListRow = Prisma.BlogPostGetPayload<{ select: typeof LIST_SELECT }>;

function toStringArray(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value) ? value.filter((t): t is string => typeof t === "string") : [];
}

function toRow(p: ListRow): BlogPostRow {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt ?? "",
    coverUrl: p.coverUrl ?? "",
    status: p.status,
    tags: toStringArray(p.tags),
    categoryId: p.categoryId ?? "",
    categoryName: p.category?.name ?? null,
    authorName: p.author?.name ?? null,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    readMinutes: p.readMinutes,
    views: p.views,
    updatedAt: p.updatedAt.toISOString(),
  };
}

/**
 * A slug nothing else is using.
 *
 * `-2`, `-3`… rather than a random suffix: the address is read by people, and
 * two posts called "Medical coding salary in India" should read as the first
 * and the second, not as one with a hash on the end.
 */
async function uniqueSlug(base: string, exceptId?: string): Promise<string> {
  const root = slugifyTitle(base);
  for (let n = 1; n < 200; n += 1) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    const clash = await prisma.blogPost.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!clash || clash.id === exceptId) return candidate;
  }
  throw AppError.conflict("Couldn't find a free address for that title.");
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function listBlogPosts(q: ListBlogQuery) {
  const and: Prisma.BlogPostWhereInput[] = [];
  if (q.search?.trim()) {
    const term = q.search.trim();
    and.push({ OR: [{ title: { contains: term } }, { excerpt: { contains: term } }] });
  }
  if (q.status) and.push({ status: q.status });
  const where: Prisma.BlogPostWhereInput = and.length ? { AND: and } : {};

  const [rows, total] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      // Newest first, and a draft that has never been published still sorts by
      // when it was last touched.
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: LIST_SELECT,
    }),
    prisma.blogPost.count({ where }),
  ]);

  return { posts: rows.map(toRow), total, page: q.page, pageSize: q.pageSize };
}

export async function getBlogPost(id: string): Promise<BlogPostDetail> {
  const post = await prisma.blogPost.findUnique({
    where: { id },
    select: {
      ...LIST_SELECT,
      content: true,
      metaTitle: true,
      metaDescription: true,
    },
  });
  if (!post) throw AppError.notFound("That post no longer exists.");
  return {
    ...toRow(post),
    content: post.content,
    metaTitle: post.metaTitle ?? "",
    metaDescription: post.metaDescription ?? "",
  };
}

function coreData(input: BlogPostInput) {
  return {
    title: input.title,
    excerpt: input.excerpt || null,
    content: input.content,
    coverUrl: input.coverUrl || null,
    status: input.status,
    tags: input.tags,
    categoryId: input.categoryId || null,
    metaTitle: input.metaTitle || null,
    metaDescription: input.metaDescription || null,
    readMinutes: readingMinutes(input.content),
  };
}

export async function createBlogPost(
  input: BlogPostInput,
  authorId: string,
): Promise<string> {
  const slug = await uniqueSlug(input.slug || input.title);
  const post = await prisma.blogPost.create({
    data: {
      ...coreData(input),
      slug,
      authorId,
      // Publishing straight from the New form should date the post today.
      publishedAt: input.status === "PUBLISHED" ? new Date() : null,
    },
    select: { id: true },
  });
  return post.id;
}

export async function updateBlogPost(id: string, input: BlogPostInput): Promise<void> {
  const existing = await prisma.blogPost.findUnique({
    where: { id },
    select: { slug: true, publishedAt: true },
  });
  if (!existing) throw AppError.notFound("That post no longer exists.");

  const wanted = input.slug || slugifyTitle(input.title);
  const slug = wanted === existing.slug ? existing.slug : await uniqueSlug(wanted, id);

  await prisma.blogPost.update({
    where: { id },
    data: {
      ...coreData(input),
      slug,
      // The publish date is set once and then left alone — editing a live post
      // shouldn't shuffle it back to the top of the blog.
      publishedAt:
        input.status === "PUBLISHED" ? (existing.publishedAt ?? new Date()) : existing.publishedAt,
    },
  });
}

export async function deleteBlogPost(id: string): Promise<void> {
  const deleted = await prisma.blogPost.deleteMany({ where: { id } });
  if (deleted.count === 0) throw AppError.notFound("That post no longer exists.");
}

// ── Public ───────────────────────────────────────────────────────────────────

const PUBLISHED = {
  status: "PUBLISHED",
  publishedAt: { not: null },
} satisfies Prisma.BlogPostWhereInput;

export async function listPublishedPosts(opts: {
  page?: number;
  pageSize?: number;
  tag?: string;
} = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(24, Math.max(1, opts.pageSize ?? 9));

  const where: Prisma.BlogPostWhereInput = opts.tag
    ? // `tags` is a JSON array; `array_contains` is the portable way to ask.
      { ...PUBLISHED, tags: { array_contains: [opts.tag] } }
    : PUBLISHED;

  const [rows, total] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: LIST_SELECT,
    }),
    prisma.blogPost.count({ where }),
  ]);

  return { posts: rows.map(toRow), total, page, pageSize };
}

export async function getPublishedPost(slug: string): Promise<BlogPostDetail | null> {
  const post = await prisma.blogPost.findFirst({
    where: { slug, ...PUBLISHED },
    select: { ...LIST_SELECT, content: true, metaTitle: true, metaDescription: true },
  });
  if (!post) return null;

  // Fire-and-forget: a failed counter must never cost the reader their article.
  prisma.blogPost
    .update({ where: { id: post.id }, data: { views: { increment: 1 } } })
    .catch(() => null);

  return {
    ...toRow(post),
    content: post.content,
    metaTitle: post.metaTitle ?? "",
    metaDescription: post.metaDescription ?? "",
  };
}

/** Other published posts to read next — same tag first, then the newest. */
export async function relatedPosts(post: BlogPostDetail, take = 3) {
  const sameTag = post.tags.length
    ? await prisma.blogPost.findMany({
        where: { ...PUBLISHED, id: { not: post.id }, tags: { array_contains: [post.tags[0]] } },
        orderBy: { publishedAt: "desc" },
        take,
        select: LIST_SELECT,
      })
    : [];

  if (sameTag.length >= take) return sameTag.map(toRow);

  const filler = await prisma.blogPost.findMany({
    where: {
      ...PUBLISHED,
      id: { notIn: [post.id, ...sameTag.map((p) => p.id)] },
    },
    orderBy: { publishedAt: "desc" },
    take: take - sameTag.length,
    select: LIST_SELECT,
  });

  return [...sameTag, ...filler].map(toRow);
}

/** Every tag in use, most-used first — the filter row on /blog. */
export async function listBlogTags(): Promise<string[]> {
  const rows = await prisma.blogPost.findMany({
    where: PUBLISHED,
    select: { tags: true },
    take: 500,
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of toStringArray(row.tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([tag]) => tag);
}
