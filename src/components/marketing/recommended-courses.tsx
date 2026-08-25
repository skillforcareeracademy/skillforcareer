import { CourseCard } from "@/components/marketing/course-card";
import { ButtonLink } from "@/components/shared/button-link";
import { ROUTES } from "@/lib/constants";
import type { TrendingProgram } from "@/server/services/course-service";

/**
 * "Learners also took" rail under a course. Same category first, so someone
 * who has decided on the field but not the course has somewhere to go other
 * than the back button.
 */
export function RecommendedCourses({ courses }: { courses: TrendingProgram[] }) {
  if (courses.length === 0) return null;

  return (
    <section className="bg-muted/30 border-t">
      <div className="container-page py-14 sm:py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold sm:text-3xl">
              Learners also took these
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Hand-picked programmes in the same field, with the same placement support.
            </p>
          </div>
          <ButtonLink href={ROUTES.courses} variant="outline" size="sm">
            Browse all courses
          </ButtonLink>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <CourseCard key={c.id} program={c} />
          ))}
        </div>
      </div>
    </section>
  );
}
