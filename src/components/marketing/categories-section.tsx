import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { listPublicCategories } from "@/server/services/category-service";
import { CATEGORY_STYLES, DEFAULT_CATEGORY_STYLE } from "@/config/marketing";
import type { HomeData } from "@/lib/validations/homepage";
import { cn } from "@/lib/utils";

export async function CategoriesSection({ data }: { data: HomeData<"categories"> }) {
  // Counts come from the catalogue, so the tiles can't advertise 128 courses in
  // a category that holds one.
  const categories = (await listPublicCategories()).slice(0, data.limit);
  if (categories.length === 0) return null;

  return (
    <section id="categories" className="container-page py-16 sm:py-20">
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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {categories.map((cat) => {
          const { icon: Icon, gradient } =
            CATEGORY_STYLES[cat.slug] ?? DEFAULT_CATEGORY_STYLE;
          return (
            <Link key={cat.slug} href={`/courses?category=${cat.slug}`}>
              <Card className="group hover:border-primary/40 h-full flex-row items-center gap-4 p-4 transition-all hover:shadow-md">
                <span
                  className={cn(
                    "flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm transition-transform group-hover:scale-105",
                    gradient,
                  )}
                >
                  <Icon className="size-6" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {cat.name}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {cat.courseCount} course{cat.courseCount === 1 ? "" : "s"}
                  </span>
                </span>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
