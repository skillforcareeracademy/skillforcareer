import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCertificateByCode } from "@/server/services/certificate-service";
import {
  CertificateDocument,
  certificateHeading,
} from "@/components/certificate/certificate-document";
import { PrintCertificateButton } from "@/components/certificate/print-button";
import { CertificatePrintStyles } from "@/components/certificate/print-styles";
import { ButtonLink } from "@/components/shared/button-link";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const cert = await getCertificateByCode(decodeURIComponent(code));
  return {
    title: cert ? `${certificateHeading(cert.type)} — ${cert.studentName}` : "Certificate",
  };
}

export default async function CertificatePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const cert = await getCertificateByCode(decodeURIComponent(code));
  if (!cert) notFound();

  return (
    <main className="bg-muted/40 min-h-svh px-4 py-10">
      <CertificatePrintStyles />

      <div className="cert-chrome mx-auto mb-6 flex max-w-[297mm] items-center justify-between gap-3">
        <Link href={`/verify/${cert.verificationCode}`} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
          <ArrowLeft className="size-4" /> Verification
        </Link>
        <PrintCertificateButton />
      </div>

      <CertificateDocument cert={cert} />

      <div className="cert-chrome mx-auto mt-6 max-w-[297mm] text-center">
        <ButtonLink href="/courses" variant="outline">
          Explore more courses
        </ButtonLink>
      </div>
    </main>
  );
}
