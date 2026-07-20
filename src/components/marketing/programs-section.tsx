import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CourseCard } from "./course-card";
import { PROGRAMS } from "@/config/marketing";

export function ProgramsSection() {
  return (
    <section id="programs" className="bg-muted/30 border-y">
      <div className="container-page py-16 sm:py-20">
        <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl sm:text-4xl">Trending programs</h2>
            <p className="text-muted-foreground mt-2">
              Industry-designed programs with mentorship and career support.
            </p>
          </div>
          <Link
            href="/courses"
            className="text-primary inline-flex items-center gap-1 text-sm font-semibold hover:underline"
          >
            Browse all programs <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PROGRAMS.map((program) => (
            <CourseCard key={program.title} program={program} />
          ))}
        </div>
      </div>
    </section>
  );
}
