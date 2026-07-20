import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CATEGORIES } from "@/config/marketing";

export function CategoriesSection() {
  return (
    <section id="categories" className="container-page py-16 sm:py-20">
      <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl sm:text-4xl">Explore top categories</h2>
          <p className="text-muted-foreground mt-2">
            Choose a domain and start building job-ready skills.
          </p>
        </div>
        <Link
          href="/courses"
          className="text-primary inline-flex items-center gap-1 text-sm font-semibold hover:underline"
        >
          View all categories <ArrowRight className="size-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {CATEGORIES.map((cat) => (
          <Link key={cat.slug} href={`/courses?category=${cat.slug}`}>
            <Card className="group hover:border-primary/40 h-full flex-row items-center gap-4 p-4 transition-all hover:shadow-md">
              <span
                className={cn(
                  "flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm transition-transform group-hover:scale-105",
                  cat.gradient,
                )}
              >
                <cat.icon className="size-6" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {cat.name}
                </span>
                <span className="text-muted-foreground text-xs">
                  {cat.courses} courses
                </span>
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
