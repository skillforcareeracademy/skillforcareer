import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { getScheduleWindow, scheduleStats } from "@/server/services/schedule-service";
import { ScheduleClient } from "@/components/admin/schedule/schedule-client";
import { listBatchClassProgress } from "@/server/services/class-schedule-service";
import { BatchClassProgressList } from "@/components/batches/batch-class-progress";

export const metadata: Metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";

export default async function InstructorSchedulePage() {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.INSTRUCTOR]);
  const [events, stats, progress] = await Promise.all([
    getScheduleWindow({ instructorId: user.id, base: "/instructor" }),
    scheduleStats(user.id),
    listBatchClassProgress({ instructorId: user.id }),
  ]);
  return (
    <ScheduleClient
      events={events}
      stats={stats}
      batchProgress={<BatchClassProgressList items={progress} batchesHref="/instructor/batches" />}
    />
  );
}
