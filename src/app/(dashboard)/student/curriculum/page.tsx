import type { Metadata } from "next";
import { BookMarked } from "lucide-react";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { listCurriculumsForLearner } from "@/server/services/curriculum-plan-service";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

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
                  <p className="text-muted-foreground mt-1 text-xs">
                    {[...c.courseTitles, ...c.batchNames].join(" · ")}
                  </p>
                </div>

                {c.tabs.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    The sections are being written — check back shortly.
                  </p>
                ) : (
                  <ol className="space-y-3">
                    {c.tabs.map((t, i) => (
                      <li key={t.id} className="rounded-xl border p-4">
                        <p className="text-sm font-medium">
                          {i + 1}. {t.heading}
                        </p>
                        {t.description && (
                          <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
                            {t.description}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
