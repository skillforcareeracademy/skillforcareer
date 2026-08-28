import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight, CalendarDays, Clock, Newspaper, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { listBlogTags, listPublishedPosts } from "@/server/services/blog-service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Career guidance, course explainers and industry notes from the team at Skill For Career Academy.",
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 9;

export default async function BlogIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tag?: string }>;
}) {
  const { page: rawPage, tag } = await searchParams;
  const page = Math.max(1, Number(rawPage) || 1);

  const [{ posts, total }, tags] = await Promise.all([
    listPublishedPosts({ page, pageSize: PAGE_SIZE, tag }),
    listBlogTags(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) =>
    `/blog?${new URLSearchParams({ ...(tag ? { tag } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <>
      <section className="relative overflow-hidden border-b">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 -left-24 size-[32rem] rounded-full bg-rose-500/15 blur-3xl" />
          <div className="absolute -top-24 right-0 size-[30rem] rounded-full bg-violet-500/15 blur-3xl" />
        </div>

        <div className="container-page py-16 sm:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <span className="text-primary inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-sm font-medium">
              <Sparkles className="size-4" /> From the academy
            </span>
            <h1 className="mt-5 text-4xl leading-[1.1] font-bold sm:text-5xl">
              Guidance worth{" "}
              <span className="bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">
                reading before you enrol
              </span>
            </h1>
            <p className="text-muted-foreground mx-auto mt-5 max-w-2xl text-lg text-pretty">
              Course explainers, career advice and notes from the people teaching
              the batches.
            </p>
          </div>

          {tags.length > 0 && (
            <div className="mt-10 flex flex-wrap justify-center gap-2">
              <Link href="/blog">
                <Badge
                  variant={tag ? "outline" : "default"}
                  className={cn("cursor-pointer px-3 py-1", !tag && "pointer-events-none")}
                >
                  Everything
                </Badge>
              </Link>
              {tags.map((t) => (
                <Link key={t} href={`/blog?tag=${encodeURIComponent(t)}`}>
                  <Badge
                    variant={tag === t ? "default" : "outline"}
                    className="cursor-pointer px-3 py-1"
                  >
                    {t}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="container-page py-16 sm:py-20">
        {posts.length === 0 ? (
          <EmptyState
            icon={Newspaper}
            title={tag ? `Nothing tagged “${tag}” yet` : "No articles yet"}
            description="New pieces go up as the team writes them — check back soon."
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <Link key={post.id} href={`/blog/${post.slug}`} className="group block h-full">
                <Card className="h-full gap-0 overflow-hidden p-0 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl">
                  <div className="bg-muted relative aspect-video overflow-hidden">
                    {post.coverUrl ? (
                      <Image
                        src={post.coverUrl}
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        unoptimized
                      />
                    ) : (
                      <div className="grid h-full place-items-center bg-gradient-to-br from-rose-500 to-pink-600 text-white">
                        <Newspaper className="size-8" />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-5">
                    {post.tags.length > 0 && (
                      <span className="text-primary text-xs font-semibold tracking-wide uppercase">
                        {post.tags[0]}
                      </span>
                    )}
                    <h2 className="mt-1.5 leading-snug font-semibold">{post.title}</h2>
                    {post.excerpt && (
                      <p className="text-muted-foreground mt-2 line-clamp-3 text-sm">
                        {post.excerpt}
                      </p>
                    )}

                    <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs">
                      {post.publishedAt && (
                        <span className="flex items-center gap-1.5">
                          <CalendarDays className="size-3.5" />
                          {format(new Date(post.publishedAt), "d MMM yyyy")}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <Clock className="size-3.5" /> {post.readMinutes} min read
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-12 flex items-center justify-center gap-4">
            {page > 1 && (
              <Link
                href={href(page - 1)}
                className="text-primary text-sm font-semibold hover:underline"
              >
                ← Newer
              </Link>
            )}
            <span className="text-muted-foreground text-sm">
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={href(page + 1)}
                className="text-primary inline-flex items-center gap-1 text-sm font-semibold hover:underline"
              >
                Older <ArrowRight className="size-4" />
              </Link>
            )}
          </div>
        )}
      </section>
    </>
  );
}
