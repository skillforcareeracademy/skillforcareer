import {
  CertificateSheet,
  RevokedStamp,
  Signature,
  type TemplateProps,
} from "./shared";

/**
 * The watercolour washes at the head and foot of the sheet.
 *
 * The ragged edge is the whole character of this design, so it is drawn as a
 * hand-authored path with a soft blur and a scatter of stars behind it, rather
 * than a rectangle with a wavy border. Two overlapping washes at different
 * opacities give the pooling that a single flat fill can't.
 */
function Wash({
  edge,
  from,
  via,
  to,
}: {
  edge: "top" | "bottom";
  from: string;
  via: string;
  to: string;
}) {
  const id = edge;
  // Both edges use the same silhouette; the bottom one is flipped, which keeps
  // them related without being a mirror the eye can catch.
  const path =
    edge === "top"
      ? "M0 0 H1000 V96 C946 128 902 96 858 118 C806 144 764 108 712 130 C660 152 620 118 566 140 C516 160 470 128 420 150 C372 171 330 140 282 158 C232 177 190 146 142 164 C96 181 52 154 0 172 Z"
      : "M0 210 H1000 V104 C948 76 904 108 858 88 C808 66 766 100 714 80 C662 60 620 94 568 74 C518 55 472 88 422 68 C374 49 332 82 284 62 C234 42 192 76 144 56 C98 37 52 68 0 48 Z";

  return (
    <svg
      viewBox="0 0 1000 210"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-x-0 ${edge === "top" ? "top-0" : "bottom-0"} h-[15cqw] w-full`}
      aria-hidden
    >
      <defs>
        <linearGradient id={`wash-${id}`} x1="0" y1={edge === "top" ? "0" : "1"} x2="1" y2={edge === "top" ? "1" : "0"}>
          <stop offset="0%" stopColor={from} />
          <stop offset="50%" stopColor={via} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
        <filter id={`blur-${id}`} x="-10%" y="-30%" width="120%" height="160%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* A softer, offset copy behind the main wash reads as pigment pooling. */}
      <path d={path} fill={`url(#wash-${id})`} opacity="0.45" filter={`url(#blur-${id})`}
        transform={edge === "top" ? "translate(0,10)" : "translate(0,-10)"} />
      <path d={path} fill={`url(#wash-${id})`} filter={`url(#blur-${id})`} />

      {/* The speckle of stars the client's design has in the darker areas. */}
      {[
        [120, 40], [260, 22], [410, 58], [540, 30], [690, 52], [830, 26], [930, 62],
        [180, 78], [350, 92], [610, 84], [770, 96],
      ].map(([x, y]) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={edge === "top" ? y : 210 - y}
          r={y % 3 === 0 ? 1.6 : 1}
          fill="#ffffff"
          opacity="0.85"
        />
      ))}
    </svg>
  );
}

/**
 * **Certificate of Internship** — the period award, for recognising a stretch of
 * outstanding work rather than a completed programme. The period is the point,
 * so it is set as large as the heading.
 */
export function InternshipAppreciationCertificate({ cert, chrome }: TemplateProps) {
  const period = cert.details.period?.trim();
  const org = cert.details.organisation?.trim() || chrome.siteName;

  return (
    <CertificateSheet className="bg-white text-neutral-900">
      <Wash edge="top" from="#4c2f83" via="#6b3fa0" to="#8b5fc0" />
      <Wash edge="bottom" from="#0f3d6e" via="#14507f" to="#1f6ea8" />

      {/* The top wash's ragged edge dips to roughly 13cqw at the middle of the
          sheet, which is exactly where the logo used to start — so it sat *on*
          the purple ("logo overlap ho rha hai"). The column starts below the
          wash now, and the gaps through the middle are tightened to pay for it,
          because the signatures still have to clear the bottom wash. */}
      <div className="relative flex h-full flex-col items-center px-[10cqw] pt-[13cqw] pb-[4cqw] text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={chrome.logoUrl}
          alt={chrome.siteName}
          className="h-[5.4cqw] w-auto max-w-[20cqw] object-contain"
        />

        <h1 className="mt-[1.2cqw] font-[family-name:var(--font-cert-serif)] text-[4.2cqw] leading-none text-[#1f5c86]">
          Certificate of Internship
        </h1>

        <p className="mt-[0.9cqw] text-[1.55cqw] text-[#1f5c86]">
          This certificate is proudly presented to
        </p>

        <p className="mt-[1.6cqw] font-[family-name:var(--font-cert-serif)] text-[6.4cqw] leading-none font-bold text-[#5b3a97]">
          {cert.studentName}
        </p>

        <p className="mt-[1.6cqw] text-[1.5cqw] text-neutral-700">
          for outstanding performance in
        </p>

        {period && (
          <p className="mt-[0.4cqw] font-[family-name:var(--font-cert-serif)] text-[3cqw] tracking-[0.05em] text-[#1f5c86] uppercase">
            {period}
          </p>
        )}

        {/* An explicit bottom margin, not just the row's `mt-auto`: when the
            column runs out of free space `mt-auto` resolves to zero and the
            signatures ride up onto this line. */}
        <p className="mt-[0.8cqw] mb-[2.5cqw] text-[1.25cqw] text-neutral-600">
          at {org} · Certificate code{" "}
          <span className="font-semibold">{cert.verificationCode}</span>
        </p>

        {/* Above the bottom wash, not on it — dark ink on a deep blue wash is
            the one thing a printed certificate cannot afford. */}
        <div className="mt-auto mb-[9.5cqw] flex w-full items-end justify-center gap-[14cqw]">
          <Signature signatory={chrome.left} bracketRole />
          <Signature signatory={chrome.right} bracketRole />
        </div>
      </div>

      <RevokedStamp revoked={cert.status === "REVOKED"} />
    </CertificateSheet>
  );
}
