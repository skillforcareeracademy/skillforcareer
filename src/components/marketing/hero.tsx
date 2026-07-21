import Link from "next/link";
import Image from "next/image";
import { Star, ShieldCheck, Trophy } from "lucide-react";
import { CourseSearch } from "@/components/shared/course-search";
import { HERO_AVATARS } from "@/config/marketing";
import { listPopularCourses } from "@/server/services/course-service";

/** "Complete Data Science Bootcamp: Python" → "Complete Data Science Bootcamp" */
function chipLabel(title: string): string {
  return title.split(/\s*[:—–|(]\s*/)[0].trim();
}

export async function Hero() {
  const popular = await listPopularCourses(6);

  return (
    <section className="relative overflow-hidden">
      {/* Ambient brand glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-24 size-[32rem] rounded-full bg-rose-500/15 blur-3xl" />
        <div className="absolute -top-24 right-0 size-[30rem] rounded-full bg-violet-500/15 blur-3xl" />
      </div>

      <div className="container-page py-16 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="border-border/70 bg-background/60 text-muted-foreground mb-6 inline-flex items-center gap-2 rounded-full border py-1 pr-3.5 pl-1.5 text-xs font-medium backdrop-blur">
            <span className="flex -space-x-2">
              {HERO_AVATARS.map((src, i) => (
                <Image
                  key={src}
                  src={src}
                  alt={`Learner ${i + 1}`}
                  width={24}
                  height={24}
                  className="ring-background size-6 rounded-full object-cover ring-2"
                />
              ))}
            </span>
            Trusted by 10M+ learners worldwide
          </span>

          <h1 className="text-4xl leading-[1.05] font-bold sm:text-6xl">
            Master tomorrow&apos;s{" "}
            <span className="bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">
              skills
            </span>{" "}
            today
          </h1>

          <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-lg text-pretty">
            Learn from industry experts with live classes, hands-on projects and
            verifiable certificates — and get the career support to land the job.
          </p>

          {/* Search */}
          <CourseSearch
            variant="hero"
            placeholder="What do you want to learn?"
            className="mx-auto mt-8 max-w-xl text-left"
          />

          {/* Most-enrolled courses, straight from the catalog */}
          {popular.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <span className="text-muted-foreground text-sm">Popular:</span>
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
          <div className="text-muted-foreground mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
            <span className="flex items-center gap-1.5">
              <Star className="size-4 fill-amber-400 text-amber-400" />
              4.8/5 average rating
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="text-emerald-500 size-4" />
              Verifiable certificates
            </span>
            <span className="flex items-center gap-1.5">
              <Trophy className="text-rose-500 size-4" />
              500+ hiring partners
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
