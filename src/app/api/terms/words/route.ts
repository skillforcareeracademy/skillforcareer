import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { listTermWords } from "@/server/services/term-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The dictionary's lookup keys, so a reader's page can underline the words it
 * has a meaning for and make them clickable — "all words in the chart … become
 * clickable". Just the keys; the meaning comes from /api/terms/lookup on click.
 */
export const GET = withRoute(async () => {
  await requireApiUser();
  return ok({ words: await listTermWords() });
});
