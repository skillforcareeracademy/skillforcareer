import Link from "next/link";
import { Star, Layers, BookOpen, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface CatalogCourse {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  thumbnailUrl: string | null;
  level: string;
  categoryName: string;
  instructorName: string;
  price: number;
  discountPrice: number | null;
  pricingType: string;
  ratingAvg: number;
  ratingCount: number;
  enrollments: number;
  chapters: number;
}

const LEVEL_LABEL: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};

export function PublicCourseCard({ course }: { course: CatalogCourse }) {
  const effective = course.discountPrice ?? course.price;
  const priceLabel =
    course.pricingType === "FREE" ? "Free" : `₹${effective.toLocaleString("en-IN")}`;

  return (
    <Link href={`/courses/${course.slug}`} className="group block h-full">
      <Card className="h-full gap-0 overflow-hidden p-0 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl">
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
        </div>

        <div className="flex flex-1 flex-col p-5">
          <h3 className="line-clamp-2 leading-snug font-semibold">{course.title}</h3>
          {course.subtitle && (
            <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
              {course.subtitle}
            </p>
          )}
          <p className="text-muted-foreground mt-2 text-xs">{course.instructorName}</p>

          <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {course.ratingCount > 0 && (
              <span className="flex items-center gap-1">
                <Star className="size-3.5 fill-amber-400 text-amber-400" />
                <span className="text-foreground font-semibold">
                  {course.ratingAvg.toFixed(1)}
                </span>
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

          <div className="mt-4 flex items-center justify-between border-t pt-4">
            <span className="text-muted-foreground text-xs">
              {LEVEL_LABEL[course.level] ?? course.level}
            </span>
            <span className="text-base font-bold">{priceLabel}</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
