import { ClassicCertificate, longDate, type TemplateProps } from "./shared";

/**
 * **Certificate of Completion** — the internship award. The body names the host
 * organisation, the dates served and the work area, because that is what a
 * future employer reads. Drawn in the academy's house design.
 */
export function InternshipCompletionCertificate({ cert, chrome }: TemplateProps) {
  const { programArea, organisation, startDate, endDate, citation } = cert.details;
  const org = organisation?.trim() || chrome.siteName;
  const from = longDate(startDate);
  const to = longDate(endDate);
  const period = from && to ? `From ${from} to ${to}` : from ? `From ${from}` : "";
  const body =
    citation?.trim() ||
    (programArea
      ? `During the internship, they actively participated in key areas of ${programArea}, demonstrating dedication, professionalism and an eagerness to learn.`
      : "");

  return (
    <ClassicCertificate
      cert={cert}
      chrome={chrome}
      heading="Certificate of Completion"
      intro="This certifies that"
    >
      <p className="mt-[1.8cqw] text-[1.5cqw] text-neutral-600">
        has successfully completed an internship at
      </p>
      <p className="mt-[0.8cqw] text-[3cqw] font-bold text-[#1f2a6e]">{org}</p>

      {period && (
        <p className="mt-[0.5cqw] text-[1.35cqw] text-neutral-500">{period}</p>
      )}

      {body && (
        <p className="mx-auto mt-[1.2cqw] max-w-[64cqw] text-[1.45cqw] leading-[1.6] text-neutral-700">
          {body}
        </p>
      )}
    </ClassicCertificate>
  );
}
