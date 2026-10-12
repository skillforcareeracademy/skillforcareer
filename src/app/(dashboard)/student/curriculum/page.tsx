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
import { ExternalLink } from "lucide-react";
import { ButtonLink } from "@/components/shared/button-link";
import { Button } from "@/components/ui/button";

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
                    {c.tabs
                      .filter((t) => !t.parentId)
                      .map((t, i) => (
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
                          <CurriculumLink tab={t} />

                          {/* Whatever is filed inside this heading, stepped in
                              so the shape of the syllabus is readable. */}
                          {c.tabs.filter((sub) => sub.parentId === t.id).length > 0 && (
                            <ol className="border-muted mt-1 space-y-3 border-l pb-3 pl-4">
                              {c.tabs
                                .filter((sub) => sub.parentId === t.id)
                                .map((sub, j) => (
                                  <li key={sub.id} className="space-y-1">
                                    <p className="text-sm font-medium">
                                      {i + 1}.{j + 1} {sub.heading}
                                    </p>
                                    {sub.description && (
                                      <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                                        {sub.description}
                                      </p>
                                    )}
                                    <CurriculumLink tab={sub} />
                                  </li>
                                ))}
                            </ol>
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

/**
 * Whatever the section points at.
 *
 * Opened inside the panel unless the academy said otherwise — "link daalne ka
 * option which should open in LMS only" — so a reference does not throw the
 * learner out of their class into a browser tab they then have to find their
 * way back from.
 */
function CurriculumLink({
  tab,
}: {
  tab: { linkUrl?: string | null; linkLabel?: string | null; linkInApp?: boolean };
}) {
  if (!tab.linkUrl) return null;
  const label = tab.linkLabel?.trim() || "Open";
  const href = tab.linkInApp
    ? `/student/viewer?url=${encodeURIComponent(tab.linkUrl)}&title=${encodeURIComponent(label)}`
    : tab.linkUrl;
  // Inside the panel it is an ordinary route; sent outward it is a plain
  // anchor, so the new tab and the no-referrer both actually apply.
  if (!tab.linkInApp) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="mb-3"
        nativeButton={false}
        render={<a href={href} target="_blank" rel="noreferrer" />}
      >
        <ExternalLink className="size-4" /> {label}
      </Button>
    );
  }
  return (
    <ButtonLink href={href} size="sm" variant="outline" className="mb-3">
      <ExternalLink className="size-4" /> {label}
    </ButtonLink>
  );
}
