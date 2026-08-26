import type { HomeData } from "@/lib/validations/homepage";
import { cn } from "@/lib/utils";

/** Written out, not interpolated — Tailwind only ships classes it can see. */
const COLUMNS = [
  "lg:grid-cols-1",
  "lg:grid-cols-2",
  "lg:grid-cols-3",
  "lg:grid-cols-4",
] as const;

export function StatsBand({ data }: { data: HomeData<"stats"> }) {
  if (data.items.length === 0) return null;

  // Three figures shouldn't leave a hole in a four-column row; more than four
  // wrap onto a second row rather than shrinking to fit.
  const columns = COLUMNS[Math.min(data.items.length, 4) - 1];

  return (
    <section className="border-y bg-muted/30">
      <div className={cn("container-page grid grid-cols-2 gap-6 py-10 sm:py-12", columns)}>
        {data.items.map((stat, i) => (
          <div key={`${stat.label}-${i}`} className="text-center">
            <p className="bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
              {stat.value}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
