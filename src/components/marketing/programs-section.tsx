import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CourseCard } from "./course-card";
import { listTrendingPrograms } from "@/server/services/course-service";
import type { HomeData } from "@/lib/validations/homepage";

export async function ProgramsSection({ data }: { data: HomeData<"programs"> }) {
  const programs = await listTrendingPrograms(data.limit);
  if (programs.length === 0) return null;

  return (
    <section id="programs" className="bg-muted/30 border-y">
      <div className="container-page py-16 sm:py-20">
        <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl sm:text-4xl">{data.title}</h2>
            {data.description && (
              <p className="text-muted-foreground mt-2">{data.description}</p>
            )}
          </div>
          {data.linkLabel && data.linkHref && (
            <Link
              href={data.linkHref}
              className="text-primary inline-flex items-center gap-1 text-sm font-semibold hover:underline"
            >
              {data.linkLabel} <ArrowRight className="size-4" />
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {programs.map((program) => (
            <CourseCard key={program.id} program={program} />
          ))}
        </div>
      </div>
    </section>
  );
}
