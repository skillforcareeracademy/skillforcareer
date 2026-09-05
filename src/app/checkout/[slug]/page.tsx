import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { getSessionUser } from "@/lib/auth/api-guard";
import { getCheckoutCourse } from "@/server/services/checkout-service";
import { isEnrolled } from "@/server/services/enrollment-service";
import { CheckoutPanel } from "@/components/checkout/checkout-panel";
import { siteConfig } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A checkout is nobody's search result. */
export const metadata: Metadata = {
  title: "Complete your enrolment",
  robots: { index: false, follow: false },
};

/**
 * "Enroll Now" lands here — never on /login.
 *
 * Deliberately outside every layout group, like `/pay/[token]`: someone who has
 * decided to buy needs the course, the price and a pay button, not the site
 * navigation and certainly not a sign-in wall. Whether they have an account is
 * something the page sorts out *inside* the form.
 */
export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [course, user] = await Promise.all([getCheckoutCourse(slug), getSessionUser()]);
  if (!course) notFound();

  // Already bought it — send them to the course rather than charging twice.
  if (user && (await isEnrolled(user.id, course.id))) {
    redirect(`/student/learn/${course.slug}`);
  }

  return (
    <main className="bg-muted/30 min-h-dvh">
      <header className="bg-background/80 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link
              href={`/courses/${course.slug}`}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm font-medium"
            >
              <ArrowLeft className="size-4" />
              Back to course
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <CheckoutPanel
          course={course}
          user={user ? { name: user.name, email: user.email } : null}
        />
        <p className="text-muted-foreground mt-8 text-center text-xs">
          Need help enrolling? Call{" "}
          <a href={`tel:${siteConfig.contact.phone}`} className="hover:text-foreground underline">
            {siteConfig.contact.phoneDisplay}
          </a>
        </p>
      </div>
    </main>
  );
}
