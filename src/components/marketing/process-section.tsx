import { PhoneCall, ListChecks, GraduationCap, BriefcaseBusiness } from "lucide-react";
import { StepList, type Step } from "@/components/marketing/step-list";
import { PROCESS_STEPS } from "@/config/marketing";

const ICONS = [PhoneCall, ListChecks, GraduationCap, BriefcaseBusiness];

const STEPS: Step[] = PROCESS_STEPS.map((s, i) => ({
  title: s.title,
  body: s.body,
  icon: ICONS[i % ICONS.length],
}));

/**
 * "Steps for your successful career" — counselling through to placement.
 *
 * Most visitors arrive unsure whether this is a video library or a programme
 * with people behind it; laying the four stages out answers that before the
 * pricing does.
 */
export function ProcessSection({ className }: { className?: string }) {
  return (
    <section className={className}>
      <div className="container-page py-16 sm:py-24">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl sm:text-4xl">Steps for your successful career</h2>
          <p className="text-muted-foreground mt-3">
            From the first counselling call to the offer letter — we stay with
            you the whole way.
          </p>
        </div>
        <StepList steps={STEPS} />
      </div>
    </section>
  );
}
