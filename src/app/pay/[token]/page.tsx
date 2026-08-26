import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/shared/logo";
import { getPaymentLink } from "@/server/services/lead-payment-service";
import { PayLinkPanel } from "@/components/payments/pay-link-panel";
import { siteConfig } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A payment page is nobody's search result. */
export const metadata: Metadata = {
  title: "Pay your fees",
  robots: { index: false, follow: false },
};

/**
 * The page behind a counsellor's "share payment link".
 *
 * Deliberately outside every layout group: someone paying their admission fee
 * arrives from a WhatsApp message, has no account yet, and needs one screen
 * with the amount and a pay button — not the marketing chrome, and certainly
 * not a sign-in wall.
 */
export default async function PayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let link;
  try {
    link = await getPaymentLink(token);
  } catch {
    notFound();
  }

  return (
    <main className="bg-muted/30 flex min-h-dvh flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <Logo />
        </div>
        <PayLinkPanel link={link} />
        <p className="text-muted-foreground text-center text-xs">
          Questions about this invoice? Call{" "}
          <a href={`tel:${siteConfig.contact.phone}`} className="hover:text-foreground underline">
            {siteConfig.contact.phoneDisplay}
          </a>
        </p>
      </div>
    </main>
  );
}
