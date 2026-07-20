import Image from "next/image";
import { Star, Clock, Users, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/shared/button-link";
import { cn } from "@/lib/utils";
import type { Program, ProgramBadge } from "@/config/marketing";
import { ROUTES } from "@/lib/constants";

const BADGE_STYLES: Record<ProgramBadge, string> = {
  Bestseller: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  Popular: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  New: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  Placement: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
};

/** Program / course card — mirrors the upGrad card pattern. */
export function CourseCard({ program }: { program: Program }) {
  const Icon = program.icon;

  return (
    <Card className="group overflow-hidden p-0 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      {/* Thumbnail — 16:9 to match the face-cropped source (no head clipping) */}
      <div className="relative aspect-video overflow-hidden">
        <Image
          src={program.image}
          alt={program.title}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover object-top transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

        {program.badge && (
          <span
            className={cn(
              "absolute top-3 left-3 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm",
              BADGE_STYLES[program.badge],
            )}
          >
            {program.badge}
          </span>
        )}
        <span className="absolute top-3 right-3 rounded-full bg-black/35 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
          {program.level}
        </span>

        <span
          className={cn(
            "absolute bottom-3 left-3 flex size-9 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-md",
            program.gradient,
          )}
        >
          <Icon className="size-4.5" aria-hidden />
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <p className="text-muted-foreground text-xs font-medium">
          {program.partner}
        </p>
        <h3 className="mt-1.5 line-clamp-2 text-base leading-snug font-semibold">
          {program.title}
        </h3>

        <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          <span className="flex items-center gap-1">
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
            <span className="text-foreground font-semibold">{program.rating}</span>
          </span>
          <span className="flex items-center gap-1">
            <Users className="size-3.5" />
            {program.learners} learners
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" />
            {program.durationMonths} months
          </span>
        </div>

        <ul className="mt-4 space-y-1.5">
          {program.highlights.map((h) => (
            <li key={h} className="text-muted-foreground flex items-center gap-2 text-sm">
              <span className="bg-primary size-1.5 shrink-0 rounded-full" />
              {h}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex items-center justify-between border-t pt-4">
          <div>
            <p className="text-muted-foreground text-[11px]">Starting at</p>
            <p className="text-base font-bold">{program.price}</p>
          </div>
          <ButtonLink href={ROUTES.register} size="sm">
            View program
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </ButtonLink>
        </div>
      </div>
    </Card>
  );
}
