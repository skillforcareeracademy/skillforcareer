import { withRoute } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import {
  exportCurriculums,
  listCurriculums,
} from "@/server/services/curriculum-plan-service";
import { streamZip } from "@/server/services/export-zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const safe = (s: string) => s.replace(/[\/\\]/g, "-").slice(0, 100);
const extOf = (url: string) => {
  const m = url.split("?")[0]!.match(/\.([a-z0-9]{1,6})$/i);
  return m ? `.${m[1]!.toLowerCase()}` : "";
};

/**
 * The curriculums as a ZIP: a manifest spreadsheet of every section, and the
 * attachments the academy filed against sections that are kept inside the LMS.
 * "Curriculum export including pdfs and files."
 */
export const GET = withRoute(async () => {
  await requireApiPermission(PERMISSIONS.MANAGE_CURRICULUM);
  const [csv, plans] = await Promise.all([exportCurriculums(), listCurriculums()]);

  const stamp = new Date().toISOString().slice(0, 10);
  return streamZip(`curriculum-${stamp}.zip`, async (add) => {
    await add({ path: "curriculum.csv", content: csv });

    for (const plan of plans) {
      const dir = `${String(plan.number).padStart(3, "0")} ${safe(plan.title)}`;
      for (const tab of plan.tabs) {
        // Only an attachment the academy stored here can travel; an external
        // address is just a link, already in the sheet.
        if (!tab.linkUrl || !tab.linkUrl.startsWith("/api/files/")) continue;
        const name =
          (tab.linkLabel && safe(tab.linkLabel)) ||
          safe(tab.heading) ||
          "attachment";
        await add({
          path: `${dir}/${name}${extOf(tab.linkUrl)}`,
          fileUrl: tab.linkUrl,
        });
      }
    }
  });
});
