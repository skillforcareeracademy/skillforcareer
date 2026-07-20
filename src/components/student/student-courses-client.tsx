"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  BookOpen,
  Star,
  Layers,
  Users,
  PlayCircle,
  ArrowRight,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import type { CatalogCourse } from "@/components/marketing/catalog-course-card";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/shared/button-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Course = CatalogCourse & { categorySlug: string };

const LEVELS = [
  { value: "ALL", label: "All levels" },
  { value: "BEGINNER", label: "Beginner" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "ADVANCED", label: "Advanced" },
  { value: "ALL_LEVELS", label: "All-levels courses" },
];
const LEVEL_LABEL: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};

function pill(active: boolean) {
  return cn(
    "rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border hover:border-primary/50 hover:text-primary",
  );
}

export function StudentCoursesClient({
  courses,
  categories,
  enrolledIds,
}: {
  courses: Course[];
  categories: { slug: string; name: string }[];
  enrolledIds: string[];
}) {
  const enrolled = useMemo(() => new Set(enrolledIds), [enrolledIds]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [level, setLevel] = useState("ALL");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return courses.filter((c) => {
      if (category !== "ALL" && c.categorySlug !== category) return false;
      if (level !== "ALL" && c.level !== level) return false;
      if (q && !(`${c.title} ${c.subtitle ?? ""} ${c.instructorName}`.toLowerCase().includes(q)))
        return false;
      return true;
    });
  }, [courses, search, category, level]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Explore courses"
        description="Discover job-ready programs led by industry experts — enroll and start learning."
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search courses, instructors…"
              className="pl-9"
            />
          </div>
          <Select value={level} onValueChange={(v) => setLevel(v ?? "ALL")}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue>{(v) => LEVELS.find((l) => l.value === v)?.label ?? "All levels"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <button type="button" onClick={() => setCategory("ALL")} className={pill(category === "ALL")}>
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => setCategory(c.slug)}
              className={pill(category === c.slug)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <p className="text-muted-foreground text-sm">
        {filtered.length} {filtered.length === 1 ? "course" : "courses"}
        {enrolled.size > 0 && ` · ${enrolled.size} enrolled`}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No courses match your filters"
          description="Try a different category, level or search term."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <CourseCard key={c.id} course={c} isEnrolled={enrolled.has(c.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseCard({ course, isEnrolled }: { course: Course; isEnrolled: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const effective = course.discountPrice ?? course.price;
  const isFree = course.pricingType === "FREE";
  const priceLabel = isFree ? "Free" : `₹${effective.toLocaleString("en-IN")}`;
  const detailHref = isEnrolled ? `/student/learn/${course.slug}` : `/courses/${course.slug}`;

  async function enroll() {
    setLoading(true);
    try {
      await api.post("/api/enrollments", { courseId: course.id });
      toast.success("You're enrolled! 🎉");
      router.push(`/student/learn/${course.slug}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't enroll.");
      setLoading(false);
    }
  }

  return (
    <Card className="flex h-full flex-col gap-0 overflow-hidden p-0">
      <Link href={detailHref} className="group block">
        <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-rose-500 to-pink-600">
          {course.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={course.thumbnailUrl}
              alt={course.title}
              className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-white/90">
              <BookOpen className="size-10" aria-hidden />
            </div>
          )}
          <Badge className="absolute top-3 left-3 bg-black/40 text-white backdrop-blur-sm">
            {course.categoryName}
          </Badge>
          {isEnrolled && (
            <Badge className="absolute top-3 right-3 gap-1 bg-emerald-600 text-white">
              <CheckCircle2 className="size-3" /> Enrolled
            </Badge>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <Link href={detailHref}>
          <h3 className="hover:text-primary line-clamp-2 leading-snug font-semibold transition-colors">
            {course.title}
          </h3>
        </Link>
        {course.subtitle && (
          <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{course.subtitle}</p>
        )}
        <p className="text-muted-foreground mt-2 text-xs">{course.instructorName}</p>

        <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {course.ratingCount > 0 && (
            <span className="flex items-center gap-1">
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              <span className="text-foreground font-semibold">{course.ratingAvg.toFixed(1)}</span>
            </span>
          )}
          <span className="flex items-center gap-1">
            <Layers className="size-3.5" /> {course.chapters} chapters
          </span>
          {course.enrollments > 0 && (
            <span className="flex items-center gap-1">
              <Users className="size-3.5" /> {course.enrollments}
            </span>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4">
          <div className="min-w-0">
            <p className="text-muted-foreground text-[11px]">
              {LEVEL_LABEL[course.level] ?? course.level}
            </p>
            <p className="text-base font-bold">{priceLabel}</p>
          </div>
          {isEnrolled ? (
            <ButtonLink href={`/student/learn/${course.slug}`} size="sm">
              <PlayCircle className="size-4" /> Continue
            </ButtonLink>
          ) : (
            <Button size="sm" onClick={enroll} disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              {isFree ? "Enroll free" : "Enroll"}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
