import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { listPublicCourses } from "@/server/services/course-service";
import { listCategories } from "@/server/services/category-service";
import {
  PublicCourseCard,
  type CatalogCourse,
} from "@/components/marketing/catalog-course-card";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Courses",
  description: "Browse expert-led courses and programs.",
};

export const dynamic = "force-dynamic";

function pill(active: boolean) {
  return cn(
    "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border hover:border-primary/50 hover:text-primary",
  );
}

export default async function CoursesCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; search?: string }>;
}) {
  const sp = await searchParams;
  const category = typeof sp.category === "string" ? sp.category : undefined;
  const search = typeof sp.search === "string" ? sp.search : undefined;

  const [courses, categories] = await Promise.all([
    listPublicCourses({ categorySlug: category, search, take: 48 }),
    listCategories(),
  ]);
  const activeCategories = categories.filter((c) => c.isActive);

  return (
    <div className="container-page py-12 sm:py-16">
      <div className="mb-8 max-w-2xl">
        <h1 className="text-3xl sm:text-4xl">Explore courses</h1>
        <p className="text-muted-foreground mt-2">
          Learn job-ready skills from industry experts — live, on-demand and hybrid.
        </p>
      </div>

      <div className="mb-10 flex flex-wrap gap-2">
        <Link href="/courses" className={pill(!category)}>
          All
        </Link>
        {activeCategories.map((c) => (
          <Link key={c.id} href={`/courses?category=${c.slug}`} className={pill(category === c.slug)}>
            {c.name}
          </Link>
        ))}
      </div>

      {courses.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No courses here yet"
          description="Published courses will appear here. Check back soon."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {courses.map((c) => (
            <PublicCourseCard key={c.id} course={c as CatalogCourse} />
          ))}
        </div>
      )}
    </div>
  );
}
