import Link from "next/link";
import { ArrowRight, Star, Layers, BookOpen, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/shared/button-link";
import { ProgramEnquiryDialog } from "./program-enquiry-dialog";

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
  const href = `/courses/${course.slug}`;
  const effective = course.discountPrice ?? course.price;
  const isFree = course.pricingType === "FREE" || effective <= 0;
  const priceLabel = isFree ? "Free" : `₹${effective.toLocaleString("en-IN")}`;
  const hasDiscount =
    !isFree && course.discountPrice != null && course.discountPrice < course.price;

  return (
    <Card className="group flex h-full flex-col gap-0 overflow-hidden p-0 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <Link href={href} className="block">
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
      </Link>

      {/* Each block below is a fixed height, so the rating rows and footers line
          up across a row of cards however long a title or subtitle happens to be. */}
      <div className="flex flex-1 flex-col p-5">
        <Link href={href} className="hover:text-primary transition-colors">
          <h3 className="line-clamp-2 min-h-[2.75rem] leading-snug font-semibold">
            {course.title}
          </h3>
        </Link>
        <p className="text-muted-foreground mt-1 line-clamp-2 min-h-[2.5rem] text-sm">
          {course.subtitle}
        </p>
        <p className="text-muted-foreground mt-2 line-clamp-1 text-xs">
          {course.instructorName}
        </p>

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

        <div className="mt-auto border-t pt-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-muted-foreground text-xs">
              {LEVEL_LABEL[course.level] ?? course.level}
            </span>
            <span className="flex items-baseline gap-1.5">
              {hasDiscount && (
                <span className="text-muted-foreground text-xs line-through">
                  ₹{course.price.toLocaleString("en-IN")}
                </span>
              )}
              <span className="text-base font-bold">{priceLabel}</span>
            </span>
          </div>

          {/* Enquire without signing up, or open the course — the same pair the
              homepage programme cards offer. */}
          <div className="mt-3 flex items-center gap-2">
            <ProgramEnquiryDialog courseTitle={course.title} />
            <ButtonLink href={href} size="sm" className="flex-1">
              View program
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </ButtonLink>
          </div>
        </div>
      </div>
    </Card>
  );
}
