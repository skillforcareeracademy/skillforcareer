import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/require";
import { TerminologyClient } from "@/components/shared/terminology-client";

export const metadata: Metadata = { title: "Terminology" };

export default async function StudentTerminologyPage() {
  await requireUser();
  return <TerminologyClient canManage={false} />;
}
