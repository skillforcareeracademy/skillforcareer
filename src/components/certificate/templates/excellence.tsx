import { ClassicCertificate, longDate, type TemplateProps } from "./shared";

/**
 * **Certificate of Excellence** — the course-completion award, and the house
 * design every other award now follows. Magenta frame, lockup and QR across the
 * top, the verification code along the foot where an employer will look for it.
 */
export function ExcellenceCertificate({ cert, chrome }: TemplateProps) {
  // When the academy has recorded when the course ran, the certificate says so —
  // an employer reading it wants the dates, not just the day it was printed.
  const from = longDate(cert.details.courseStartDate);
  const to = longDate(cert.details.courseEndDate);
  const courseRun =
    from && to ? `Course held ${from} – ${to}` : from ? `Course began ${from}` : "";

  return (
    <ClassicCertificate
      cert={cert}
      chrome={chrome}
      heading="Certificate of Excellence"
      intro="This certifies that"
    >
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

      {(cert.details.batchName || cert.details.batchId) && (
        <p className="mt-[0.8cqw] text-[1.5cqw] text-neutral-500 italic">
          Batch: {cert.details.batchName}
          {cert.details.batchId ? ` (${cert.details.batchId})` : ""}
          {cert.details.instructorName ? ` · Trainer: ${cert.details.instructorName}` : ""}
        </p>
      )}

      {courseRun && (
        <p className="mt-[0.5cqw] text-[1.35cqw] text-neutral-500">{courseRun}</p>
      )}
    </ClassicCertificate>
  );
}
