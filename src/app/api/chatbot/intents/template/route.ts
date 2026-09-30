import { withRoute } from "@/lib/api/handler";
import { requireApiPermission } from "@/lib/auth/api-guard";
import { PERMISSIONS } from "@/config/roles";
import { toCsv, csvResponse } from "@/lib/csv";
import {
  CHAT_INTENT_CSV_COLUMNS,
  PATTERN_SEPARATOR,
} from "@/lib/validations/chatbot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** An empty sheet with one worked row, for an academy starting from nothing. */
export const GET = withRoute(async () => {
  await requireApiPermission(PERMISSIONS.MANAGE_HOMEPAGE);
  const example = [
    "What are the fees?",
    ["fees", "fee kitni hai", "course price"].join(` ${PATTERN_SEPARATOR} `),
    "Fees depend on the programme — each course page shows its price and any discount running at the moment.",
    "Fees",
    "See courses",
    "/courses",
    "Yes",
    "Yes",
  ];
  return csvResponse(
    "ami-answers-template.csv",
    toCsv([...CHAT_INTENT_CSV_COLUMNS], [example]),
  );
});
