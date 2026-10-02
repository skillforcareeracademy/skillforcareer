import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/require";
import { RecycleBinClient } from "@/components/shared/recycle-bin-client";

export const metadata: Metadata = { title: "Recycle bin" };

export default async function StudentRecycleBinPage() {
  await requireUser();
  return <RecycleBinClient scopeNote="Notes you have deleted — put one back here." />;
}
