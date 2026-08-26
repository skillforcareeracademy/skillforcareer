import {
  CertificateSheet,
  RevokedStamp,
  Signature,
  VerifyQr,
  longDate,
  type TemplateProps,
} from "./shared";

/**
 * **Certificate of Excellence** — the course-completion award.
 *
 * Rebuilt to match the certificate the academy already issues: magenta rule
 * around a navy keyline, the lockup and the QR balanced across the top, and the
 * verification code carried along the foot where an employer will look for it.
 */
export function ExcellenceCertificate({ cert, chrome }: TemplateProps) {
  const revoked = cert.status === "REVOKED";

  // When the academy has recorded when the course ran, the certificate says so —
  // an employer reading it wants the dates, not just the day it was printed.
  const from = longDate(cert.details.courseStartDate);
  const to = longDate(cert.details.courseEndDate);
  const courseRun = from && to ? `Course held ${from} – ${to}` : from ? `Course began ${from}` : "";

  return (
    <CertificateSheet className="bg-white text-neutral-900">
      {/* The double frame: a heavy magenta edge with a fine navy keyline inside. */}
      <div className="absolute inset-0 border-[1.2cqw] border-[#e6007e]" />
      <div className="absolute inset-[2.2cqw] border-[0.15cqw] border-[#1f2a6e]" />

      <div className="relative flex h-full flex-col px-[6cqw] py-[4.2cqw]">
        <div className="flex items-start justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={chrome.logoUrl}
            alt={chrome.siteName}
            className="h-[6cqw] w-auto max-w-[22cqw] object-contain object-left"
          />
          <VerifyQr svg={chrome.qrSvg} />
        </div>

        <div className="mt-[1cqw] flex flex-1 flex-col items-center text-center">
          <h1 className="text-[6.2cqw] leading-none font-bold text-[#e6007e]">
            Certificate of Excellence
          </h1>
          <div className="mt-[1.6cqw] h-[0.35cqw] w-[26cqw] bg-[#e6007e]" />

          <p className="mt-[2.6cqw] text-[1.6cqw] text-neutral-500 italic">
            This certifies that
          </p>
          <p className="mt-[1cqw] text-[4.6cqw] leading-tight font-bold">{cert.studentName}</p>

          {cert.courseTitle && (
            <>
              <p className="mt-[1.8cqw] text-[1.5cqw] text-neutral-600">
                has successfully completed the course
              </p>
              <p className="mt-[0.8cqw] text-[3cqw] font-bold text-[#1f2a6e]">
                {cert.courseTitle}
              </p>
            </>
          )}

          {cert.details.batchName && (
            <p className="mt-[0.8cqw] text-[1.5cqw] text-neutral-500 italic">
              Batch: {cert.details.batchName}
              {cert.details.instructorName ? ` · Trainer: ${cert.details.instructorName}` : ""}
            </p>
          )}

          {courseRun && (
            <p className="mt-[0.5cqw] text-[1.35cqw] text-neutral-500">{courseRun}</p>
          )}

          <p className="mt-[1.4cqw] text-[1.4cqw] text-neutral-600">
            Awarded on {longDate(cert.issuedAt)}
          </p>
        </div>

        <div className="relative flex items-end justify-between">
          <Signature signatory={chrome.left} />
          {/* Centred on the foot, between the two signatures, exactly as on the
              academy's existing certificate. */}
          <p className="absolute inset-x-0 bottom-0 text-center text-[1.3cqw] font-bold">
            Certificate Code: {cert.verificationCode}
          </p>
          <Signature signatory={chrome.right} />
        </div>
      </div>

      <RevokedStamp revoked={revoked} />
    </CertificateSheet>
  );
}
