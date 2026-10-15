import { withRoute } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { toCsv } from "@/lib/csv";
import { getStudentProfile } from "@/server/services/student-profile-service";
import { getStudentDetail } from "@/server/services/student-detail-service";
import { streamZip } from "@/server/services/export-zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const slug = (s: string) => s.replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "student";
const extOf = (url: string) => {
  const m = url.split("?")[0]!.match(/\.([a-z0-9]{1,6})$/i);
  return m ? `.${m[1]!.toLowerCase()}` : "";
};
const isStored = (u?: string | null): u is string => !!u && u.startsWith("/api/files/");

/**
 * One learner, zipped — a readable summary of their profile, the detail form
 * they filled in, and the actual documents they uploaded (ID proof, Aadhaar,
 * CV, photo). "Student profile export option including their docs files."
 */
export const GET = withRoute(async (_req, { params }) => {
  await requireApiPermission(PERMISSIONS.MANAGE_USERS);
  const id = String((await params).id);
  const [profile, detail] = await Promise.all([
    getStudentProfile(id),
    getStudentDetail(id),
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  return streamZip(`student-${slug(profile.name)}-${stamp}.zip`, async (add) => {
    // A flat key → value sheet of the headline profile.
    const summary: [string, string | number][] = [
      ["Name", profile.name],
      ["Email", profile.email],
      ["Phone", profile.phone ?? ""],
      ["Role", profile.role],
      ["Status", profile.status],
      ["Email verified", profile.emailVerified ? "yes" : "no"],
      ["Joined", profile.joinedCourseAt ?? profile.createdAt],
      ["Enrolments", profile.enrollments.length],
      ["Paid total", profile.paidTotal],
      ["Pending total", profile.pendingTotal],
      ["Quizzes attempted", profile.quizzes.attempted],
      ["Quizzes completed", profile.quizzes.completed],
      ["Assignments assigned", profile.assignments.assigned],
      ["Assignments completed", profile.assignments.completed],
      ["Certificates issued", profile.certificates.issued],
    ];
    await add({
      path: "profile.csv",
      content: toCsv(["Field", "Value"], summary),
    });

    const d = detail.detail;
    if (d) {
      const rows = Object.entries(d).map(([k, v]) => [k, v ?? ""] as [string, string]);
      await add({ path: "details.csv", content: toCsv(["Field", "Value"], rows) });
    }

    const docs: { label: string; url?: string | null; name?: string | null }[] = [
      { label: "photo", url: profile.avatarUrl },
      { label: "aadhaar", url: d?.aadhaarUrl },
      { label: "id-proof", url: d?.idProofUrl },
      { label: "cv", url: d?.cvUrl, name: d?.cvName },
    ];
    for (const doc of docs) {
      if (!isStored(doc.url)) continue;
      await add({
        path: `documents/${doc.label}${extOf(doc.name ?? doc.url)}`,
        fileUrl: doc.url,
      });
    }
  });
});
