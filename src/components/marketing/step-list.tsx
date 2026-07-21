import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface Step {
  title: string;
  body: string;
  icon: LucideIcon;
}

/**
 * A numbered "how it works" rail.
 *
 * The steps are cards rather than loose text so the sequence reads as one band
 * instead of four floating paragraphs, and the rules between them are drawn in
 * the grid gaps — horizontally on the 4-up desktop layout, vertically once the
 * cards stack. They're anchored to the badge centre (`top-11` = 24px padding +
 * half of the 40px badge), so the line meets each number head-on.
 */
export function StepList({ steps, className }: { steps: Step[]; className?: string }) {
  return (
    <ol
      className={cn(
        "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {steps.map(({ title, body, icon: Icon }, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={title} className="group relative">
            {!last && (
              <>
                {/* Sideways rule into the next card. In the 2-up layout only the
                    left-hand card of each pair has a neighbour to point at. */}
                <span
                  aria-hidden
                  className={cn(
                    "border-border absolute top-11 -right-6 hidden w-6 border-t border-dashed",
                    i % 2 === 0 ? "sm:block" : "lg:block",
                  )}
                />
                <span
                  aria-hidden
                  className="border-border absolute top-full left-11 h-6 border-l border-dashed sm:hidden"
                />
              </>
            )}

            <Card className="relative h-full gap-0 p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
              <Icon
                aria-hidden
                className="text-primary/10 absolute top-5 right-5 size-12"
                strokeWidth={1.5}
              />
              <span className="from-primary shadow-primary/25 relative grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br to-pink-600 text-sm font-bold text-white shadow-lg">
                {i + 1}
              </span>
              <h3 className="relative mt-5 font-semibold">{title}</h3>
              <p className="text-muted-foreground relative mt-2 text-sm">{body}</p>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}
