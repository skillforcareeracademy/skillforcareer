import { ClassicCertificate, type TemplateProps } from "./shared";

const DEFAULT_CITATION =
  "in recognition of outstanding dedication, a willingness to learn beyond regular hours, " +
  "and consistent commitment that has greatly contributed to academic and personal growth.";

/**
 * **Certificate of Appreciation** — recognises the learner rather than a
 * syllabus, so no course is named and the citation carries the meaning. Drawn in
 * the academy's house design, same as every other award.
 */
export function AppreciationCertificate({ cert, chrome }: TemplateProps) {
  const citation = cert.details.citation?.trim() || DEFAULT_CITATION;

  return (
    <ClassicCertificate
      cert={cert}
      chrome={chrome}
      heading="Certificate of Appreciation"
      intro="This certificate is proudly presented to"
    >
      <p className="mx-auto mt-[1.8cqw] max-w-[64cqw] text-[1.55cqw] leading-[1.7] text-neutral-700">
        {citation}
      </p>
      <p className="mx-auto mt-[1cqw] max-w-[64cqw] text-[1.45cqw] leading-[1.6] text-neutral-600">
        We truly appreciate your outstanding performance while studying at{" "}
        {chrome.siteName}.
      </p>
    </ClassicCertificate>
  );
}
