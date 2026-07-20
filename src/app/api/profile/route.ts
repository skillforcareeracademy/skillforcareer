import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { updateProfileSchema } from "@/lib/validations/profile";
import { getProfile, updateProfile } from "@/server/services/profile-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async () => {
  const user = await requireApiUser();
  return ok(await getProfile(user.id));
});

export const PATCH = withRoute(async (req) => {
  const user = await requireApiUser();
  const input = updateProfileSchema.parse(await req.json().catch(() => ({})));
  await updateProfile(user.id, input);
  return ok({ message: "Profile updated." });
});
