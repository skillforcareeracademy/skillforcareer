import { withRoute } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { csvResponse, toCsv } from "@/lib/csv";
import { USER_IMPORT_COLUMNS } from "@/server/services/user-service";

export const runtime = "nodejs";

/** A sample sheet with the columns the user importer reads. */
export const GET = withRoute(async () => {
  await requireApiPermission(PERMISSIONS.MANAGE_USERS);
  const csv = toCsv([...USER_IMPORT_COLUMNS], [
    ["Priya Nair", "priya@example.com", "+91 98765 43210", "Student", ""],
    ["Rahul Verma", "rahul@example.com", "+91 91234 56789", "Instructor", "Welcome@2026"],
    ["Neha Gupta", "neha@example.com", "", "Sales Agent", ""],
  ]);
  return csvResponse("skillforcareer-users-template.csv", csv);
});
