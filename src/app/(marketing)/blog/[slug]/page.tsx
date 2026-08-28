import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, CalendarDays, Clock, Newspaper } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPublishedPost, relatedPosts } from "@/server/services/blog-service";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const post = await getPublishedPost((await params).slug);
  if (!post) return { title: "Article not found" };

  return {
    title: post.metaTitle || post.title,
    description: post.metaDescription || post.excerpt || undefined,
    openGraph: {
      type: "article",
      title: post.metaTitle || post.title,
      description: post.metaDescription || post.excerpt || undefined,
      images: post.coverUrl ? [post.coverUrl] : undefined,
      publishedTime: post.publishedAt ?? undefined,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const post = await getPublishedPost((await params).slug);
  if (!post) notFound();

  const related = await relatedPosts(post);

  return (
    <>
      <article className="container-page py-12 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/blog"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
          >
            <ArrowLeft className="size-4" /> All articles
          </Link>

          <header className="mt-6">
            {post.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <Link key={tag} href={`/blog?tag=${encodeURIComponent(tag)}`}>
                    <Badge variant="outline" className="cursor-pointer">
                      {tag}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}

            <h1 className="mt-4 text-3xl leading-tight font-bold text-balance sm:text-4xl">
              {post.title}
            </h1>

            {post.excerpt && (
              <p className="text-muted-foreground mt-4 text-lg text-pretty">
                {post.excerpt}
              </p>
            )}

            <div className="text-muted-foreground mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-y py-3 text-sm">
              {post.authorName && <span>{post.authorName}</span>}
              {post.publishedAt && (
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="size-4" />
                  {format(new Date(post.publishedAt), "d MMMM yyyy")}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Clock className="size-4" /> {post.readMinutes} min read
              </span>
            </div>
          </header>

          {post.coverUrl && (
            <div className="bg-muted relative mt-8 aspect-video overflow-hidden rounded-2xl border">
              <Image
                src={post.coverUrl}
                alt=""
                fill
                sizes="(min-width: 1024px) 48rem, 100vw"
                className="object-cover"
                unoptimized
                priority
              />
            </div>
          )}

          {/* The body is HTML written by an admin in the LMS editor, which only
              emits the formatting marks its toolbar offers — no scripts, no
              embeds, and no path for a reader to put anything into it. */}
          <div
            className="prose-blog mt-10"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        </div>
      </article>

      {related.length > 0 && (
        <section className="bg-muted/30 border-t">
          <div className="container-page py-14">
            <h2 className="text-2xl font-semibold">Read next</h2>
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((other) => (
                <Link
                  key={other.id}
                  href={`/blog/${other.slug}`}
                  className="group block h-full"
                >
                  <Card className="h-full gap-0 overflow-hidden p-0 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-lg">
                    <div className="bg-muted relative aspect-video">
                      {other.coverUrl ? (
                        <Image
                          src={other.coverUrl}
                          alt=""
                          fill
                          sizes="(min-width: 1024px) 30vw, 100vw"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="grid h-full place-items-center bg-gradient-to-br from-rose-500 to-pink-600 text-white">
                          <Newspaper className="size-7" />
                        </div>
                      )}
                    </div>
                    <div className="p-5">
                      <h3 className="leading-snug font-semibold">{other.title}</h3>
                      <p className="text-muted-foreground mt-2 text-xs">
                        {other.readMinutes} min read
                      </p>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
