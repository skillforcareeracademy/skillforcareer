import type { Metadata } from "next";
import Link from "next/link";
import { PlayCircle, CheckCircle2, GraduationCap } from "lucide-react";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { getMyLearning } from "@/server/services/enrollment-service";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/shared/button-link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "My Learning" };
export const dynamic = "force-dynamic";

const LEVEL_LABEL: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};

export default async function MyLearningPage() {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STUDENT]);
  const courses = await getMyLearning(user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Learning"
        description="Pick up where you left off and keep making progress."
        actions={<ButtonLink href="/courses">Browse courses</ButtonLink>}
      />

      {courses.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="You haven't enrolled in any courses yet"
          description="Explore the catalog and enroll to start learning."
          action={<ButtonLink href="/courses">Explore courses</ButtonLink>}
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => {
            const done = c.progressPercent >= 100;
            return (
              <Card key={c.enrollmentId} className="gap-0 overflow-hidden p-0">
                <Link href={`/student/learn/${c.slug}`} className="group block">
                  <div className="ring-border relative aspect-video overflow-hidden bg-gradient-to-br from-rose-500/15 to-pink-600/15">
                    {c.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.thumbnailUrl}
                        alt=""
                        className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <span className="grid size-full place-items-center">
                        <PlayCircle className="size-10 text-rose-500/60" />
                      </span>
                    )}
                    <span className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100">
                      <PlayCircle className="size-12 text-white" />
                    </span>
                  </div>
                </Link>
                <div className="space-y-3 p-4">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {LEVEL_LABEL[c.level] ?? c.level}
                      </Badge>
                      {done && (
                        <Badge variant="secondary" className="gap-1 bg-emerald-100 text-[10px] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                          <CheckCircle2 className="size-3" /> Completed
                        </Badge>
                      )}
                    </div>
                    <Link href={`/student/learn/${c.slug}`}>
                      <h3 className="line-clamp-2 font-semibold hover:underline">{c.title}</h3>
                    </Link>
                    <p className="text-muted-foreground text-xs">{c.categoryName}</p>
                  </div>

                  <div>
                    <div className="text-muted-foreground mb-1 flex items-center justify-between text-xs">
                      <span>
                        {c.completedLessons}/{c.totalLessons} lessons
                      </span>
                      <span className="tabular-nums">{c.progressPercent}%</span>
                    </div>
                    <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                      <div
                        className={done ? "bg-emerald-500 h-full rounded-full" : "bg-primary h-full rounded-full"}
                        style={{ width: `${c.progressPercent}%` }}
                      />
                    </div>
                  </div>

                  <ButtonLink
                    href={`/student/learn/${c.slug}`}
                    variant={done ? "outline" : "default"}
                    className="w-full"
                    size="sm"
                  >
                    {done ? "Review course" : c.progressPercent > 0 ? "Continue" : "Start learning"}
                  </ButtonLink>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
