import {
  ArrowRight,
  Award,
  BookOpen,
  BrainCircuit,
  Briefcase,
  Boxes,
  Clock,
  Cloud,
  Code2,
  Database,
  Megaphone,
  Palette,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/shared/button-link";
import { ProgramEnquiryDialog } from "./program-enquiry-dialog";
import type { TrendingProgram } from "@/server/services/course-service";
import { cn } from "@/lib/utils";

const LEVEL_LABEL: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};

/** Per-category glyph + tint, so a card is recognisable before you read it. */
const CATEGORY_STYLE: Record<string, { icon: LucideIcon; gradient: string }> = {
  "data-science": { icon: Database, gradient: "from-rose-500 to-pink-600" },
  "ai-ml": { icon: BrainCircuit, gradient: "from-violet-500 to-purple-600" },
  management: { icon: Briefcase, gradient: "from-amber-500 to-orange-600" },
  "software-development": { icon: Code2, gradient: "from-sky-500 to-blue-600" },
  "cloud-devops": { icon: Cloud, gradient: "from-cyan-500 to-blue-600" },
  "product-management": { icon: Boxes, gradient: "from-fuchsia-500 to-pink-600" },
  "digital-marketing": { icon: Megaphone, gradient: "from-emerald-500 to-teal-600" },
  design: { icon: Palette, gradient: "from-indigo-500 to-violet-600" },
};
const DEFAULT_STYLE = { icon: BookOpen, gradient: "from-rose-500 to-pink-600" };

function durationLabel(minutes: number): string | null {
  if (!minutes) return null;
  const hours = Math.round(minutes / 60);
  return hours >= 1 ? `${hours} hours` : `${minutes} min`;
}

function learnersLabel(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
}

/** Program / course card — mirrors the upGrad card pattern. */
export function CourseCard({ program }: { program: TrendingProgram }) {
  const { icon: Icon, gradient } = CATEGORY_STYLE[program.categorySlug] ?? DEFAULT_STYLE;
  const effective = program.discountPrice ?? program.price;
  const isFree = program.pricingType === "FREE" || effective <= 0;
  const priceLabel = isFree ? "Free" : `₹${effective.toLocaleString("en-IN")}`;
  const savings =
    !isFree && program.discountPrice && program.discountPrice < program.price
      ? Math.round(((program.price - program.discountPrice) / program.price) * 100)
      : null;
  const duration = durationLabel(program.durationMinutes);
  const href = `/courses/${program.slug}`;

  return (
    <Card className="group h-full overflow-hidden p-0 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      {/* Thumbnail — 16:9 to match the face-cropped source (no head clipping) */}
      <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-rose-500 to-pink-600">
        {program.thumbnailUrl ? (
          /* Plain <img>, like the catalogue card: the admin can paste a
             thumbnail from any host (Freepik, Pexels, their own upload), and
             next/image would reject every domain not listed in next.config. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={program.thumbnailUrl}
            alt={program.title}
            className="size-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-white/90">
            <BookOpen className="size-10" aria-hidden />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

        {program.isFeatured && (
          <span className="absolute top-3 left-3 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 shadow-sm dark:bg-amber-500/15 dark:text-amber-300">
            Bestseller
          </span>
        )}
        <span className="absolute top-3 right-3 rounded-full bg-black/35 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
          {LEVEL_LABEL[program.level] ?? program.level}
        </span>

        <span
          className={cn(
            "absolute bottom-3 left-3 flex size-9 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-md",
            gradient,
          )}
        >
          <Icon className="size-4.5" aria-hidden />
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <p className="text-muted-foreground text-xs font-medium">{program.categoryName}</p>
        <h3 className="mt-1.5 line-clamp-2 text-base leading-snug font-semibold">
          {program.title}
        </h3>

        <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          {program.ratingCount > 0 && (
            <span className="flex items-center gap-1">
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              <span className="text-foreground font-semibold">
                {program.ratingAvg.toFixed(1)}
              </span>
            </span>
          )}
          {program.enrollments > 0 && (
            <span className="flex items-center gap-1">
              <Users className="size-3.5" />
              {learnersLabel(program.enrollments)} learners
            </span>
          )}
          {duration && (
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" />
              {duration}
            </span>
          )}
        </div>

        {/* Objectives make the best bullets; a course without them falls back to
            its subtitle so the card doesn't carry a hole where they'd be. */}
        {program.highlights.length > 0 ? (
          <ul className="mt-4 space-y-1.5">
            {program.highlights.map((h) => (
              <li
                key={h}
                className="text-muted-foreground flex items-start gap-2 text-sm"
              >
                <span className="bg-primary mt-1.5 size-1.5 shrink-0 rounded-full" />
                <span className="line-clamp-1">{h}</span>
              </li>
            ))}
          </ul>
        ) : (
          program.subtitle && (
            <p className="text-muted-foreground mt-4 line-clamp-3 text-sm">
              {program.subtitle}
            </p>
          )
        )}

        {/* mt-auto: a course with no objectives has a shorter body, and without
            this its price and buttons float mid-card next to its neighbours. */}
        <div className="mt-auto border-t pt-4">
          {/* One line, filled end to end: what you pay, what it lists at, and
              what you save — rather than a lone price with dead space beside it. */}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-lg font-bold">{priceLabel}</span>
            {savings && (
              <span className="text-muted-foreground text-sm line-through">
                ₹{program.price.toLocaleString("en-IN")}
              </span>
            )}
            {savings ? (
              <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                {savings}% off
              </span>
            ) : (
              <span className="text-muted-foreground ml-auto inline-flex items-center gap-1 text-xs">
                <Award className="size-3.5" aria-hidden /> Certificate
              </span>
            )}
          </div>

          {/* Enquiry sits beside the primary action: the client asked that a
              visitor be able to reach us — or open the programme — without
              being pushed through sign-up first. */}
          <div className="mt-3 flex items-center gap-2">
            <ProgramEnquiryDialog courseTitle={program.title} />
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
