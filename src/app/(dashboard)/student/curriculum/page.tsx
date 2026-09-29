import type { Metadata } from "next";
import { BookMarked } from "lucide-react";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { listCurriculumsForLearner } from "@/server/services/curriculum-plan-service";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Curriculum" };

/** What the academy says each of this learner's courses covers. */
export default async function StudentCurriculumPage() {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT]);
  const curriculums = await listCurriculumsForLearner(user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Curriculum"
        description="What your course covers, straight from the academy."
      />

      {curriculums.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="Nothing here yet"
          description="When your academy publishes the curriculum for your course or batch, it will appear here."
        />
      ) : (
        <div className="space-y-5">
          {curriculums.map((c) => (
            <Card key={c.id}>
              <CardContent className="space-y-4 py-6">
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                    {c.title}
                    {c.year && (
                      <Badge variant="secondary" className="text-[10px] font-normal">
                        {c.year}
                      </Badge>
                    )}
                  </p>
                  {/* The learner's own course, and the academy's identifier for
                      the curriculum. Which cohorts it was assigned to is the
                      office's business, not theirs — "all assigned batches name
                      or code assigned to curriculum should not be visible". */}
                  <p className="text-muted-foreground mt-1 text-xs">
                    {[c.curriculumId, ...c.courseTitles].filter(Boolean).join(" · ")}
                  </p>
                </div>

                {c.tabs.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    The sections are being written — check back shortly.
                  </p>
                ) : (
                  // Folded away by default: a full curriculum is pages long,
                  // and the academy asked for it to open a section at a time.
                  <Accordion className="space-y-2">
                    {c.tabs.map((t, i) => (
                      <AccordionItem key={t.id} value={t.id} className="rounded-xl border px-4">
                        <AccordionTrigger className="text-left text-sm font-medium">
                          {i + 1}. {t.heading}
                        </AccordionTrigger>
                        <AccordionContent>
                          {t.description ? (
                            <p className="text-muted-foreground pb-3 text-sm whitespace-pre-wrap">
                              {t.description}
                            </p>
                          ) : (
                            <p className="text-muted-foreground pb-3 text-sm">
                              Nothing written under this heading yet.
                            </p>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
