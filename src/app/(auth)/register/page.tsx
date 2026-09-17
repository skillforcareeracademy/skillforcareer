import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/register-form";
import { getHomeSection } from "@/server/services/homepage-service";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const { data } = await getHomeSection("authPanel");
  return <RegisterForm next={next} title={data.signUpTitle} description={data.signUpSubtitle} />;
}
