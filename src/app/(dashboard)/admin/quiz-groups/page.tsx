import { redirect } from "next/navigation";

/** Kept so older links land somewhere useful: the filing moved to one screen. */
export default function QuizGroupsRedirect() {
  redirect("/admin/groups/quiz");
}
