import { requireUser } from "@/lib/auth/require";
import { getProfile } from "@/server/services/profile-service";
import { ProfileClient } from "./profile-client";

/** Shared profile view — used by every role's /…/profile route. */
export async function ProfileView() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  return <ProfileClient profile={profile} />;
}
