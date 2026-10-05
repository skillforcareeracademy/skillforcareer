import Image from "next/image";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight, CalendarDays, Clock, Newspaper } from "lucide-react";
import { Card } from "@/components/ui/card";
import { listPublishedPosts } from "@/server/services/blog-service";
import type { HomeData } from "@/lib/validations/homepage";

/**
 * The latest writing, on the landing page — "home page pr Article ka section
 * nhi daala. Yaani blog". The posts come straight from Blog, so the band keeps
 * itself current and an empty blog simply takes the section off the page.
 */
export async function ArticlesSection({
  data,
}: {
  data: HomeData<"articles">;
}) {
  const { posts } = await listPublishedPosts({
    pageSize: data.limit,
    tag: data.tag || undefined,
  });
  if (posts.length === 0) return null;

  return (
    <section id="articles" className="border-t">
      <div className="container-page py-16 sm:py-20">
        <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl sm:text-4xl">{data.title}</h2>
            {data.description && (
              <p className="text-muted-foreground mt-2">{data.description}</p>
            )}
          </div>
          {data.linkLabel && data.linkHref && (
            <Link
              href={data.linkHref}
              className="text-primary inline-flex items-center gap-1 text-sm font-semibold hover:underline"
            >
              {data.linkLabel} <ArrowRight className="size-4" />
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/blog/${post.slug}`}
              className="group block h-full"
            >
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
                  <h3 className="mt-1.5 leading-snug font-semibold">
                    {post.title}
                  </h3>
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
      </div>
    </section>
  );
}
