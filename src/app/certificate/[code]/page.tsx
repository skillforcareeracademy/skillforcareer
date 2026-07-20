import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCertificateByCode } from "@/server/services/certificate-service";
import { CertificateDocument } from "@/components/certificate/certificate-document";
import { PrintCertificateButton } from "@/components/certificate/print-button";
import { ButtonLink } from "@/components/shared/button-link";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const cert = await getCertificateByCode(decodeURIComponent(code));
  return { title: cert ? `Certificate — ${cert.studentName}` : "Certificate" };
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
      {/* Print styles: show only the certificate on paper. */}
      <style>{`@media print {
        body { background: white !important; }
        .cert-chrome { display: none !important; }
        #certificate { box-shadow: none !important; border-width: 3px !important; max-width: 100% !important; }
        @page { margin: 12mm; }
      }`}</style>

      <div className="cert-chrome mx-auto mb-6 flex max-w-3xl items-center justify-between gap-3">
        <Link href={`/verify/${cert.verificationCode}`} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
          <ArrowLeft className="size-4" /> Verification
        </Link>
        <PrintCertificateButton />
      </div>

      <CertificateDocument cert={cert} />

      <div className="cert-chrome mx-auto mt-6 max-w-3xl text-center">
        <ButtonLink href="/courses" variant="outline">
          Explore more courses
        </ButtonLink>
      </div>
    </main>
  );
}
