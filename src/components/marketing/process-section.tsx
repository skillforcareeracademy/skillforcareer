import { StepList, type Step } from "@/components/marketing/step-list";
import { iconFor } from "@/config/icons";
import type { HomeData } from "@/lib/validations/homepage";

/**
 * "Steps for your successful career" — counselling through to placement.
 *
 * Most visitors arrive unsure whether this is a video library or a programme
 * with people behind it; laying the stages out answers that before the pricing
 * does.
 */
export function ProcessSection({
  data,
  className,
}: {
  data: HomeData<"process">;
  className?: string;
}) {
  if (data.items.length === 0) return null;

  const steps: Step[] = data.items.map((s) => ({
    title: s.title,
    body: s.body,
    icon: iconFor(s.icon, "ListChecks"),
  }));

  return (
    <section className={className}>
      <div className="container-page py-16 sm:py-24">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl sm:text-4xl">{data.title}</h2>
          {data.description && (
            <p className="text-muted-foreground mt-3">{data.description}</p>
          )}
        </div>
        <StepList steps={steps} />
      </div>
    </section>
  );
}
