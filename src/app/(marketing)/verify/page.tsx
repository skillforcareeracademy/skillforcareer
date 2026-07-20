import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { VerifyForm } from "@/components/marketing/verify-form";
import { CertificateDocument } from "@/components/certificate/certificate-document";

const SAMPLE_CERT = {
  studentName: "Ananya Sharma",
  courseTitle: "Complete Data Science Bootcamp with Python",
  serialNumber: "SFC-2026-000420",
  verificationCode: "SAMPLE",
  issuedAt: "2026-02-14T00:00:00.000Z",
  status: "ISSUED",
};

export const metadata: Metadata = {
  title: "Verify a certificate",
  description: "Verify the authenticity of a SkillForCareer certificate.",
};

export default function VerifyLandingPage() {
  return (
    <div className="container-page flex justify-center py-16 sm:py-24">
      <div className="w-full max-w-xl text-center">
        <div className="bg-primary/10 text-primary mx-auto mb-5 grid size-14 place-items-center rounded-2xl">
          <ShieldCheck className="size-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Verify a certificate</h1>
        <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm">
          Enter the verification code printed on a SkillForCareer certificate to confirm it&apos;s
          genuine.
        </p>
        <div className="mt-6 text-left">
          <VerifyForm />
        </div>

        {/* What a SkillForCareer certificate looks like */}
        <div className="mt-14">
          <p className="text-muted-foreground mb-4 text-sm font-medium">
            What a SkillForCareer certificate looks like
          </p>
          <div className="scale-[0.92]">
            <CertificateDocument cert={SAMPLE_CERT} />
          </div>
        </div>
      </div>
    </div>
  );
}
