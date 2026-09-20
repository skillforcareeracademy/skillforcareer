"use client";

import { useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  Clock,
  FileUp,
  Pencil,
  UserPlus,
  Users,
} from "lucide-react";
import type { BatchProfile } from "@/server/services/batch-profile-service";
import { BATCH_STATUS_LABEL } from "@/lib/validations/batch";
import { PageHeader } from "@/components/shared/page-header";
import { ButtonLink } from "@/components/shared/button-link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BatchStudentsSheet,
  type BatchStudentsTarget,
} from "../batch-students-sheet";
import { BatchImportDialog } from "../batch-import-dialog";
import { BatchAssociatesManager } from "../batch-associates-manager";
import { OverviewTab } from "./overview-tab";
import { LearnersTab } from "./learners-tab";
import { AttendanceTab } from "./attendance-tab";
import { BatchClassesPanel } from "@/components/batches/batch-classes-panel";
import { NotesTab } from "./notes-tab";
import { AssessmentsTab } from "./assessments-tab";
import { SimilarTab } from "./similar-tab";
import {
  BATCH_STATUS_BADGE,
  calendarDay,
  initials,
  scheduleLabel,
} from "./format";
import { cn } from "@/lib/utils";

export interface BatchProfileAccess {
  /** Staff or the lead instructor: may change the roster and the instructors. */
  canManageRoster: boolean;
  /** Anyone teaching the batch (or staff): may share notes and set quizzes. */
  canTeach: boolean;
  isStaff: boolean;
  /** "/admin" or "/instructor" — where links inside the profile point. */
  basePath: string;
}

export const PROFILE_TABS = [
  "overview",
  "learners",
  "attendance",
  "classes",
  "notes",
  "assessments",
  "similar",
] as const;

/**
 * The batch profile page: who teaches it, who is on it, how they are doing,
 * and everything that has been shared with it — one screen per cohort.
 */
export function BatchProfileView({
  profile,
  access,
  initialTab,
}: {
  profile: BatchProfile;
  access: BatchProfileAccess;
  initialTab?: string;
}) {
  const [tab, setTab] = useState<string>(
    PROFILE_TABS.includes(initialTab as (typeof PROFILE_TABS)[number])
      ? initialTab!
      : "overview",
  );
  const [importing, setImporting] = useState(false);
  const [managing, setManaging] = useState<BatchStudentsTarget | null>(null);
  const [instructorsOpen, setInstructorsOpen] = useState(false);

  const cap = profile.capacity ?? 0;
  const seated = profile.learners.length;
  const fillPct = cap ? Math.min(100, Math.round((seated / cap) * 100)) : 0;
  const schedule = scheduleLabel(profile.schedule);

  function openAddStudents() {
    setManaging({
      id: profile.id,
      name: profile.name,
      capacity: profile.capacity,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={profile.name}
        description={`${profile.code} · ${profile.course.title}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`${access.basePath}/batches`} variant="outline">
              <ArrowLeft className="size-4" /> Batches
            </ButtonLink>
            {access.canManageRoster && (
              <>
                <Button variant="outline" onClick={() => setImporting(true)}>
                  <FileUp className="size-4" /> Import
                </Button>
                <Button onClick={openAddStudents}>
                  <UserPlus className="size-4" /> Add students
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* ── Header card ─────────────────────────────────────────────────── */}
      <Card className="gap-0 p-0">
        <div className="grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0 space-y-2">
            <p className="text-muted-foreground text-xs">Status</p>
            <Badge
              variant="secondary"
              className={BATCH_STATUS_BADGE[profile.status]}
            >
              {BATCH_STATUS_LABEL[profile.status] ?? profile.status}
            </Badge>
            <p className="flex min-w-0 items-center gap-1.5 text-sm">
              <BookOpen className="text-muted-foreground size-4 shrink-0" />
              <span className="truncate">{profile.course.title}</span>
            </p>
          </div>

          <div className="min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-muted-foreground text-xs">Instructors</p>
              {access.canManageRoster && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setInstructorsOpen(true)}
                >
                  <Pencil className="size-3" /> Associates
                </Button>
              )}
            </div>
            {profile.instructor ? (
              <PersonChip
                name={profile.instructor.name}
                avatarUrl={profile.instructor.avatarUrl}
                tag="Lead"
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                No lead instructor
              </p>
            )}
            {profile.associates.map((a) => (
              <PersonChip
                key={a.id}
                name={a.name}
                avatarUrl={a.avatarUrl}
                tag="Associate"
              />
            ))}
          </div>

          <div className="min-w-0 space-y-2">
            <p className="text-muted-foreground text-xs">Timeline</p>
            <p className="flex items-center gap-1.5 text-sm">
              <CalendarClock className="text-muted-foreground size-4 shrink-0" />
              {calendarDay(profile.startDate)} – {calendarDay(profile.endDate)}
            </p>
            {schedule && (
              <p className="flex items-center gap-1.5 text-sm">
                <Clock className="text-muted-foreground size-4 shrink-0" />
                {schedule}
              </p>
            )}
          </div>

          <div className="min-w-0 space-y-2">
            <p className="text-muted-foreground text-xs">Capacity</p>
            <p className="flex items-center gap-1.5 text-sm">
              <Users className="text-muted-foreground size-4 shrink-0" />
              <span className="font-semibold tabular-nums">{seated}</span>
              <span className="text-muted-foreground">
                {cap ? `/ ${cap} seats` : "learners · no seat limit"}
              </span>
            </p>
            {cap > 0 && (
              <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                <div
                  className={cn(
                    "h-full rounded-full",
                    fillPct >= 100 ? "bg-rose-500" : "bg-primary",
                  )}
                  style={{ width: `${fillPct}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="learners">
            Learners ({profile.learners.length})
          </TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="classes">
            Classes ({profile.classes.length})
          </TabsTrigger>
          <TabsTrigger value="notes">
            Notes ({profile.notes.length})
          </TabsTrigger>
          <TabsTrigger value="assessments">Quizzes &amp; tests</TabsTrigger>
          <TabsTrigger value="similar">Similar batches</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab profile={profile} onOpenTab={setTab} />
        </TabsContent>

        <TabsContent value="learners" className="mt-4">
          <LearnersTab
            profile={profile}
            access={access}
            onImport={() => setImporting(true)}
            onAdd={openAddStudents}
          />
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          <AttendanceTab profile={profile} />
        </TabsContent>

        <TabsContent value="classes" className="mt-4">
          {/* The batch's timetable: completed / pending counts, and for its
              teachers reschedule, cancel, end, add a class or rebuild. */}
          <BatchClassesPanel batchId={profile.id} canManage={access.canTeach} />
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <NotesTab
            batchId={profile.id}
            notes={profile.notes}
            canEdit={access.canTeach}
          />
        </TabsContent>

        <TabsContent value="assessments" className="mt-4">
          <AssessmentsTab profile={profile} access={access} />
        </TabsContent>

        <TabsContent value="similar" className="mt-4">
          <SimilarTab similar={profile.similar} basePath={access.basePath} />
        </TabsContent>
      </Tabs>

      {access.canManageRoster && (
        <>
          <BatchImportDialog
            batchId={profile.id}
            batchName={profile.name}
            open={importing}
            onOpenChange={setImporting}
          />
          <BatchStudentsSheet
            batch={managing}
            onOpenChange={(o) => !o && setManaging(null)}
          />
          <Dialog open={instructorsOpen} onOpenChange={setInstructorsOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Instructors · {profile.name}</DialogTitle>
                <DialogDescription>
                  {profile.instructor
                    ? `${profile.instructor.name} leads this batch. Associates co-teach it, see it under their batches, and can share notes and quizzes with it.`
                    : "Associates co-teach this batch, see it under their batches, and can share notes and quizzes with it. Set the lead instructor from Edit batch."}
                </DialogDescription>
              </DialogHeader>
              <BatchAssociatesManager batchId={profile.id} />
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

function PersonChip({
  name,
  avatarUrl,
  tag,
}: {
  name: string;
  avatarUrl: string | null;
  tag: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar className="size-7 shrink-0">
        {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
        <AvatarFallback className="text-[10px]">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 truncate text-sm">{name}</span>
      <Badge variant="outline" className="shrink-0 text-[10px]">
        {tag}
      </Badge>
    </div>
  );
}
