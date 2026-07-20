import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { requireApiUser } from "@/lib/auth/api-guard";
import { changePasswordSchema } from "@/lib/validations/profile";
import { changePassword } from "@/server/services/profile-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute(async (req) => {
  const user = await requireApiUser();
  const input = changePasswordSchema.parse(await req.json().catch(() => ({})));
  await changePassword(user.id, input.currentPassword, input.newPassword);
  return ok({ message: "Password changed." });
});
