import { ClassicCertificate, type TemplateProps } from "./shared";

/**
 * **Certificate of Internship** — the period award, for a stretch of outstanding
 * work rather than a completed programme. The period is the point, so it is set
 * large. Drawn in the academy's house design.
 */
export function InternshipAppreciationCertificate({ cert, chrome }: TemplateProps) {
  const period = cert.details.period?.trim();
  const org = cert.details.organisation?.trim() || chrome.siteName;

  return (
    <ClassicCertificate
      cert={cert}
      chrome={chrome}
      heading="Certificate of Internship"
      intro="This certificate is proudly presented to"
    >
      <p className="mt-[1.8cqw] text-[1.5cqw] text-neutral-600">
        for outstanding performance in
      </p>

      {period && (
        <p className="mt-[0.8cqw] text-[3cqw] font-bold text-[#1f2a6e] uppercase">
          {period}
        </p>
      )}

      <p className="mt-[0.8cqw] text-[1.5cqw] text-neutral-500 italic">at {org}</p>
    </ClassicCertificate>
  );
}
