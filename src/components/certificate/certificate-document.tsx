import { format } from "date-fns";
import { BadgeCheck, ShieldX } from "lucide-react";
import { getBranding } from "@/server/services/branding-service";

export interface CertificateData {
  studentName: string;
  courseTitle: string;
  serialNumber: string;
  verificationCode: string;
  issuedAt: string;
  status: string;
}

/** A print-ready certificate. Rendered on /certificate/[code] and printed to PDF. */
export async function CertificateDocument({ cert }: { cert: CertificateData }) {
  const revoked = cert.status === "REVOKED";
  // The real brand lockup from Admin → Settings → Branding, not a stand-in mark:
  // this document is what a learner sends an employer.
  const { logoUrl, siteName } = await getBranding();
  return (
    <div
      id="certificate"
      className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border-4 border-rose-500/30 bg-white p-8 text-center text-neutral-900 shadow-xl sm:p-14"
      style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
    >
      {/* Decorative corners */}
      <div className="pointer-events-none absolute -top-16 -right-16 size-40 rounded-full bg-rose-500/10" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 size-40 rounded-full bg-rose-500/10" />

      <div className="relative">
        <div className="flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt={siteName}
            className="h-14 w-auto max-w-[15rem] object-contain sm:h-16"
          />
        </div>

        <p className="mt-8 text-xs font-semibold tracking-[0.3em] text-rose-500 uppercase">
          Certificate of Completion
        </p>

        <p className="mt-8 text-sm text-neutral-500">This is proudly presented to</p>
        <h1 className="mt-2 font-serif text-4xl font-bold sm:text-5xl">{cert.studentName}</h1>

        <p className="mt-6 text-sm text-neutral-500">for successfully completing</p>
        <p className="mt-1 text-xl font-semibold">{cert.courseTitle}</p>

        <div className="mx-auto mt-10 flex max-w-md items-end justify-between gap-6 text-left">
          <div>
            <p className="border-t border-neutral-300 pt-1 text-xs text-neutral-500">Date issued</p>
            <p className="text-sm font-medium">{format(new Date(cert.issuedAt), "d MMMM yyyy")}</p>
          </div>
          <div className="text-center">
            {revoked ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-200 px-2.5 py-1 text-xs font-semibold text-neutral-600">
                <ShieldX className="size-3.5" /> Revoked
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                <BadgeCheck className="size-3.5" /> Verified
              </span>
            )}
          </div>
          <div className="text-right">
            <p className="border-t border-neutral-300 pt-1 text-xs text-neutral-500">Serial</p>
            <p className="font-mono text-sm font-medium">{cert.serialNumber}</p>
          </div>
        </div>

        <p className="mt-8 text-[11px] text-neutral-400">
          Verify this certificate at skillforcareer.com/verify · Code{" "}
          <span className="font-mono">{cert.verificationCode}</span>
        </p>
      </div>
    </div>
  );
}
