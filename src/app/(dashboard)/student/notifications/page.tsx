import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { PageHeader } from "@/components/shared/page-header";
import { getNotificationFeed } from "@/server/services/notification-service";
import { NotificationsList } from "@/components/dashboard/notifications-list";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

/** The learner's notifications in full — the header bell with room to breathe. */
export default async function StudentNotificationsPage() {
  const user = await requireRole([
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.STUDENT,
  ]);
  const feed = await getNotificationFeed(user.id, 100);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Everything the academy has let you know about — classes, fees, results and more."
      />
      <NotificationsList initial={feed.items} />
    </div>
  );
}
