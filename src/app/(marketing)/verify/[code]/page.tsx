import type { Metadata } from "next";
import { format } from "date-fns";
import { CheckCircle2, XCircle, Ban, GraduationCap } from "lucide-react";
import { getCertificateByCode } from "@/server/services/certificate-service";
import { VerifyForm } from "@/components/marketing/verify-form";
import { ButtonLink } from "@/components/shared/button-link";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  return { title: `Verify · ${code}` };
}

export default async function VerifyCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const cert = await getCertificateByCode(decodeURIComponent(code));

  const valid = cert && cert.status === "ISSUED";
  const revoked = cert && cert.status === "REVOKED";

  return (
    <div className="container-page flex justify-center py-16 sm:py-20">
      <div className="w-full max-w-xl">
        {/* Status banner */}
        <div
          className={`flex items-center gap-3 rounded-2xl border p-4 ${
            valid
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200"
              : revoked
                ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
                : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200"
          }`}
        >
          {valid ? (
            <CheckCircle2 className="size-6 shrink-0" />
          ) : revoked ? (
            <Ban className="size-6 shrink-0" />
          ) : (
            <XCircle className="size-6 shrink-0" />
          )}
          <div>
            <p className="font-semibold">
              {valid
                ? "Certificate verified"
                : revoked
                  ? "Certificate revoked"
                  : "Certificate not found"}
            </p>
            <p className="text-sm opacity-80">
              {valid
                ? "This is a genuine SkillForCareer certificate."
                : revoked
                  ? "This certificate exists but has been revoked and is no longer valid."
                  : `No certificate matches the code “${decodeURIComponent(code)}”.`}
            </p>
          </div>
        </div>

        {/* Certificate details */}
        {cert && (
          <div className="mt-6 overflow-hidden rounded-2xl border bg-gradient-to-br from-rose-50 to-pink-50 p-8 text-center dark:from-rose-950/20 dark:to-pink-950/10">
            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow">
              <GraduationCap className="size-7" />
            </div>
            <p className="text-muted-foreground text-xs tracking-widest uppercase">
              Certificate of Completion
            </p>
            <p className="mt-3 text-2xl font-bold">{cert.studentName}</p>
            <p className="text-muted-foreground mt-1 text-sm">has successfully completed</p>
            <p className="mt-1 text-lg font-medium">{cert.courseTitle}</p>
            <div className="text-muted-foreground mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs">
              <span>
                Serial <span className="font-mono">{cert.serialNumber}</span>
              </span>
              <span>Issued {format(new Date(cert.issuedAt), "d MMMM yyyy")}</span>
            </div>
            {valid && (
              <div className="mt-6">
                <ButtonLink href={`/certificate/${cert.verificationCode}`}>Download PDF</ButtonLink>
              </div>
            )}
          </div>
        )}

        {/* Verify another */}
        <div className="mt-8">
          <p className="text-muted-foreground mb-2 text-sm">Verify another certificate</p>
          <VerifyForm />
        </div>
      </div>
    </div>
  );
}
