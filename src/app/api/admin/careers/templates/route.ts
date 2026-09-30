import { withRoute } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { toCsv, csvResponse } from "@/lib/csv";
import {
  CANDIDATE_CSV_COLUMNS,
  PARTNER_CSV_COLUMNS,
} from "@/lib/validations/careers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * An empty sheet with one worked row — `?kind=partner` or `?kind=candidate`.
 * One route rather than three: the three tabs differ only in their columns.
 */
export const GET = withRoute(async (req) => {
  await requireApiPermission(PERMISSIONS.MANAGE_PLACEMENTS);
  const kind = new URL(req.url).searchParams.get("kind");

  if (kind === "candidate") {
    const example = [
      "Asha Verma",
      "asha@example.com",
      "9876543210",
      "Complete Medical Coding",
      "MC59",
      "Medical coder",
      "Fresher",
      "",
      "Indore",
      "Onsite",
      "Immediate",
      "New",
      "",
      "",
      "Walked in at the Indore drive",
    ];
    return csvResponse(
      "candidates-template.csv",
      toCsv([...CANDIDATE_CSV_COLUMNS], [example]),
    );
  }

  const example = [
    "Acme Health Services",
    "Ritu Sharma",
    "ritu@acmehealth.in",
    "9876543210",
    "https://acmehealth.in",
    "Indore",
    "Yes",
    "Hires coders every quarter",
  ];
  return csvResponse(
    "partners-template.csv",
    toCsv([...PARTNER_CSV_COLUMNS], [example]),
  );
});
