import { IdCard } from "lucide-react";
import type { StudentDetailView } from "@/server/services/student-detail-service";
import { ButtonLink } from "@/components/shared/button-link";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

/**
 * "Your profile isn't finished yet."
 *
 * Shown on the learner's dashboard until the academy has what it needs on file.
 * It names what is missing rather than nagging in the abstract, and it goes away
 * of its own accord at 100%.
 */
export function ProfileCompletionNotice({ view }: { view: StudentDetailView }) {
  if (view.completion >= 100) return null;

  const shortlist = view.missing.slice(0, 4).join(", ");
  const more = view.missing.length - 4;

  return (
    <Card className="border-amber-300/60 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10">
      <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/15">
          <IdCard className="size-5 text-amber-700 dark:text-amber-300" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="font-medium">Finish your student profile</p>
            <p className="text-muted-foreground text-sm">
              {view.completion === 0
                ? "The academy needs your address, ID, schooling and CV on file — about five minutes."
                : `Still needed: ${shortlist}${more > 0 ? ` and ${more} more` : ""}.`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Progress value={view.completion} className="h-1.5 max-w-xs" />
            <span className="text-muted-foreground text-xs tabular-nums">
              {view.completion}%
            </span>
          </div>
        </div>
        <ButtonLink href="/student/profile/details" className="shrink-0">
          Complete it
        </ButtonLink>
      </CardContent>
    </Card>
  );
}
