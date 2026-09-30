import type { Metadata } from "next";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { listStages } from "@/server/services/lead-pipeline-service";
import { PipelineClient } from "@/components/admin/leads/pipeline-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pipeline stages" };

/** The academy's own stages and statuses, added and edited here. */
export default async function PipelinePage() {
  await requireApiPermission(PERMISSIONS.MANAGE_LEADS);
  const stages = await listStages();
  return <PipelineClient stages={stages} />;
}
