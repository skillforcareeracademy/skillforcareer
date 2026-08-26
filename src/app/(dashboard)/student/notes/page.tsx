import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/require";
import { getSavedItems } from "@/server/services/learning-service";
import { StudentNotesClient } from "@/components/student/student-notes-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notes" };

export default async function StudentNotesPage() {
  const user = await requireUser();
  const items = await getSavedItems(user.id);
  return <StudentNotesClient items={items} />;
}
