import type { Metadata } from "next";
import { Stethoscope } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { ButtonLink } from "@/components/shared/button-link";
import { getCurrentUser } from "@/lib/auth/require";
import { PERMISSIONS, ROLE_HOME } from "@/config/roles";
import type { CodingPracticeUnavailable } from "@/server/services/coding-practice-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Coding Practice",
  robots: { index: false, follow: false },
};

const COPY: Record<CodingPracticeUnavailable, { title: string; body: string; admin?: string }> = {
  off: {
    title: "Coding Practice isn't open yet",
    body: "The academy hasn't switched Coding Practice on. Please check back soon.",
    admin: "Switch it on under Settings → Coding Practice.",
  },
  setup: {
    title: "Coding Practice isn't connected yet",
    body: "The link between your learning panel and Coding Practice hasn't been set up. Please let the academy know.",
    admin:
      "The server needs CODING_PRACTICE_SSO_SECRET (the same value Coding Practice holds as LMS_SSO_SECRET) and the product's address, either as CODING_PRACTICE_URL or under Settings → Coding Practice.",
  },
  enrolled: {
    title: "Coding Practice is for enrolled learners",
    body: "It opens once you're enrolled in a course. If you think you should have access, please contact the academy.",
  },
  staff: {
    title: "Coding Practice is for the academy's staff",
    body: "It isn't open to learners yet. If you think you should have access, please contact the academy.",
  },
  account: {
    title: "Your account can't open Coding Practice",
    body: "Your account isn't active right now. Please contact the academy.",
  },
};

/**
 * Where the Coding Practice link lands when it can't sign someone in. It opens
 * in its own tab, so this is a whole page rather than a toast on a panel the
 * person has already left.
 */
export default async function CodingPracticeUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const copy = COPY[reason as CodingPracticeUnavailable] ?? COPY.off;
  const user = await getCurrentUser();
  const canConfigure = user?.permissions.includes(PERMISSIONS.MANAGE_SETTINGS) ?? false;

  return (
    <main className="bg-muted/30 flex min-h-dvh flex-col items-center justify-center gap-8 p-4 text-center">
      <Logo />
      <div className="max-w-md space-y-4">
        <span className="bg-primary/10 mx-auto flex size-14 items-center justify-center rounded-2xl">
          <Stethoscope className="text-primary size-7" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="text-muted-foreground">{copy.body}</p>
        {canConfigure && copy.admin && (
          <p className="bg-background rounded-lg border p-3 text-left text-sm">{copy.admin}</p>
        )}
        <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
          {canConfigure && (
            <ButtonLink href="/admin/settings" size="lg">
              Open settings
            </ButtonLink>
          )}
          <ButtonLink
            href={user ? (ROLE_HOME[user.role] ?? "/") : "/"}
            size="lg"
            variant={canConfigure ? "outline" : "default"}
          >
            Back to your panel
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
