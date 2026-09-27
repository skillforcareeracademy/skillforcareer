import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/register-form";
import { getHomeSection } from "@/server/services/homepage-service";
import { getSettings } from "@/server/services/settings-service";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const [{ data }, { settings }] = await Promise.all([getHomeSection("authPanel"), getSettings()]);
  return (
    <RegisterForm
      next={next}
      title={data.signUpTitle}
      description={data.signUpSubtitle}
      // The referral field only makes sense while refer-and-earn is on.
      showReferral={settings.referralEnabled}
    />
  );
}
