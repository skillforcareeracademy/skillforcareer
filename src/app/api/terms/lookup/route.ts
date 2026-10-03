import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { lookUpWord } from "@/server/services/term-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What a word means — the pop-up behind clicking one while reading.
 *
 * Returns every sense, because the same spelling can be a root and an
 * abbreviation and we should not guess which was meant.
 */
export const GET = withRoute(async (req) => {
  const user = await requireApiUser();
  const word = new URL(req.url).searchParams.get("word") ?? "";
  return ok({ word, terms: await lookUpWord(word, user.id) });
});
