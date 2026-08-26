import Link from "next/link";
import { CourseSearch } from "@/components/shared/course-search";
import { iconFor, toneFor } from "@/config/icons";
import { listPopularCourses } from "@/server/services/course-service";
import type { HomeData } from "@/lib/validations/homepage";
import { cn } from "@/lib/utils";

/** "Complete Data Science Bootcamp: Python" → "Complete Data Science Bootcamp" */
function chipLabel(title: string): string {
  return title.split(/\s*[:—–|(]\s*/)[0].trim();
}

export async function Hero({ data }: { data: HomeData<"hero"> }) {
  // Chips are the catalogue's own most-enrolled courses, not copy an admin has
  // to keep in step with it — so the toggle is all the editor needs to expose.
  const popular = data.showPopular ? await listPopularCourses(data.popularLimit) : [];

  return (
    <section className="relative overflow-hidden">
      {/* Ambient brand glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-24 size-[32rem] rounded-full bg-rose-500/15 blur-3xl" />
        <div className="absolute -top-24 right-0 size-[30rem] rounded-full bg-violet-500/15 blur-3xl" />
      </div>

      <div className="container-page py-16 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          {(data.badgeText || data.avatars.length > 0) && (
            <span className="border-border/70 bg-background/60 text-muted-foreground mb-6 inline-flex items-center gap-2 rounded-full border py-1 pr-3.5 pl-1.5 text-xs font-medium backdrop-blur">
              {data.avatars.length > 0 && (
                <span className="flex -space-x-2">
                  {data.avatars.map((avatar, i) => (
                    // Plain <img>: the URL is whatever an admin uploaded or
                    // pasted, and next/image refuses hosts that aren't in
                    // next.config's remotePatterns.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`${avatar.url}-${i}`}
                      src={avatar.url}
                      alt=""
                      width={24}
                      height={24}
                      className="ring-background size-6 rounded-full object-cover ring-2"
                    />
                  ))}
                </span>
              )}
              {data.badgeText}
            </span>
          )}

          <h1 className="text-4xl leading-[1.05] font-bold sm:text-6xl">
            {data.titleLead}{" "}
            <span className="bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">
              {data.titleHighlight}
            </span>{" "}
            {data.titleTail}
          </h1>

          {data.subtitle && (
            <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-lg text-pretty">
              {data.subtitle}
            </p>
          )}

          {/* Search */}
          <CourseSearch
            variant="hero"
            placeholder={data.searchPlaceholder}
            className="mx-auto mt-8 max-w-xl text-left"
          />

          {/* Most-enrolled courses, straight from the catalog */}
          {popular.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {data.popularLabel && (
                <span className="text-muted-foreground text-sm">{data.popularLabel}</span>
              )}
              {popular.map((course) => (
                <Link
                  key={course.id}
                  href={`/courses/${course.slug}`}
                  title={course.title}
                  className="border-border hover:border-primary/50 hover:text-primary bg-card max-w-[15rem] truncate rounded-full border px-3 py-1 text-sm font-medium transition-colors"
                >
                  {chipLabel(course.title)}
                </Link>
              ))}
            </div>
          )}

          {/* Trust line */}
          {data.trust.length > 0 && (
            <div className="text-muted-foreground mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
              {data.trust.map((item, i) => {
                const Icon = iconFor(item.icon);
                return (
                  <span key={`${item.text}-${i}`} className="flex items-center gap-1.5">
                    <Icon className={cn("size-4", toneFor(item.tone))} />
                    {item.text}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
