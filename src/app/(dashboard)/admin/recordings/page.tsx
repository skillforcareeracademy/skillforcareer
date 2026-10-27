import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import {
  listAllRecordingsForAdmin,
  listRecordingRequests,
} from "@/server/services/recording-request-service";
import { listBatchesForSelect } from "@/server/services/live-service";
import { RecordingsClient } from "@/components/admin/recordings/recordings-client";

export const metadata: Metadata = { title: "Recordings" };
export const dynamic = "force-dynamic";

/**
 * Every class recording, always — "super admin mein all recording honi chahiye,
 * kabhi expiry ya ended nahi". Plus the queue of learner requests to share.
 */
export default async function AdminRecordingsPage() {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
  const [recordings, requests, batches] = await Promise.all([
    listAllRecordingsForAdmin(),
    listRecordingRequests(),
    listBatchesForSelect(),
  ]);
  return (
    <RecordingsClient
      recordings={recordings}
      requests={requests}
      batches={batches.map((b) => ({ id: b.id, name: b.name, courseTitle: b.courseTitle }))}
    />
  );
}
