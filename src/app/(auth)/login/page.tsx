import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth/require";
import { ROLE_HOME } from "@/config/roles";
import { getHomeSection } from "@/server/services/homepage-service";

export const metadata: Metadata = { title: "Sign in" };

/**
 * `?next=` is the whole point of this signature: a visitor sent here from a
 * course or a checkout has to come back to it afterwards, not be dumped on
 * their dashboard.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Already signed in? Go straight to where you were headed, or your dashboard.
  // The phone app opens this page every launch, and the proxy has just renewed
  // the session from the saved refresh cookie — without this the learner met a
  // login form each time and signed in again ("har baar login krna pd rha h").
  // An absolute or protocol-relative `next` is ignored — only our own paths.
  const user = await getCurrentUser();
  if (user) {
    const safeNext =
      next && next.startsWith("/") && !next.startsWith("//") ? next : null;
    redirect(safeNext ?? ROLE_HOME[user.role] ?? "/");
  }

  const { data } = await getHomeSection("authPanel");
  return <LoginForm next={next} title={data.signInTitle} description={data.signInSubtitle} />;
}
