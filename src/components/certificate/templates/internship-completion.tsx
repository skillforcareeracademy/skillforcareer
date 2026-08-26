import {
  CertificateSheet,
  RevokedStamp,
  Signature,
  longDate,
  type TemplateProps,
} from "./shared";

/**
 * The navy panel with the gold S-curve down its right edge.
 *
 * Two stacked paths rather than one: the gold is a *stroke* riding the same
 * curve that cuts the navy, so the two can never drift apart when the sheet is
 * scaled.
 */
function NavyPanel() {
  const curve = "M0 0 H300 C300 0 170 130 190 350 C205 520 320 620 300 700 H0 Z";
  return (
    <svg
      viewBox="0 0 340 700"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-y-0 left-0 h-full w-[34cqw]"
      aria-hidden
    >
      <defs>
        <linearGradient id="ic-navy" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#123a72" />
          <stop offset="55%" stopColor="#0d2b58" />
          <stop offset="100%" stopColor="#081d3d" />
        </linearGradient>
        <linearGradient id="ic-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f3e2a6" />
          <stop offset="45%" stopColor="#d4af37" />
          <stop offset="100%" stopColor="#9a7718" />
        </linearGradient>
      </defs>
      <path d={curve} fill="url(#ic-navy)" />
      <path d={curve} fill="none" stroke="url(#ic-gold)" strokeWidth="7" />
    </svg>
  );
}

/** The "BEST INTERN" rosette that sits on the navy. */
function InternBadge({ className }: { className?: string }) {
  const teeth = 22;
  const points = Array.from({ length: teeth * 2 }, (_, i) => {
    const angle = (Math.PI * i) / teeth - Math.PI / 2;
    const r = i % 2 === 0 ? 48 : 41;
    return `${(50 + r * Math.cos(angle)).toFixed(2)},${(50 + r * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");

  return (
    <svg viewBox="0 0 100 128" className={className} aria-hidden>
      <defs>
        <linearGradient id="ib-gold" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#fdf1c4" />
          <stop offset="40%" stopColor="#dcb84e" />
          <stop offset="100%" stopColor="#8f6d16" />
        </linearGradient>
        <linearGradient id="ib-navy" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#17427e" />
          <stop offset="100%" stopColor="#0a2149" />
        </linearGradient>
      </defs>
      {/* Ribbon tails first, so the medal overlaps them. */}
      <path d="M30 84 L22 126 L40 114 L50 126 L50 84 Z" fill="url(#ib-gold)" />
      <path d="M70 84 L78 126 L60 114 L50 126 L50 84 Z" fill="url(#ib-gold)" opacity="0.85" />

      <polygon points={points} fill="url(#ib-gold)" />
      <circle cx="50" cy="50" r="36" fill="url(#ib-navy)" />
      <circle cx="50" cy="50" r="36" fill="none" stroke="url(#ib-gold)" strokeWidth="1.6" />

      <text
        x="50"
        y="36"
        textAnchor="middle"
        fill="#f0d477"
        fontSize="9"
        letterSpacing="1.5"
      >
        ★★★★★
      </text>
      <text
        x="50"
        y="52"
        textAnchor="middle"
        fill="#ffffff"
        fontSize="15"
        fontWeight="700"
        letterSpacing="0.5"
      >
        BEST
      </text>
      <text x="50" y="66" textAnchor="middle" fill="#ffffff" fontSize="11" letterSpacing="1">
        INTERN
      </text>
      <text
        x="50"
        y="79"
        textAnchor="middle"
        fill="#f0d477"
        fontSize="9"
        letterSpacing="1.5"
      >
        ★★★★★
      </text>
    </svg>
  );
}

/**
 * **Certificate of Completion** — the internship award. Navy and gold, with the
 * body paragraph naming the work area, the host organisation and the dates
 * served, because that paragraph is what a future employer actually reads.
 */
export function InternshipCompletionCertificate({ cert, chrome }: TemplateProps) {
  const { programArea, organisation, startDate, endDate, citation } = cert.details;
  const org = organisation?.trim() || chrome.siteName;
  const from = longDate(startDate);
  const to = longDate(endDate);
  const period = from && to ? ` from ${from} to ${to}` : from ? ` from ${from}` : "";

  return (
    <CertificateSheet className="bg-gradient-to-br from-white via-[#f7f8fa] to-[#e9edf3] text-neutral-900">
      <NavyPanel />
      <InternBadge className="absolute top-[16cqw] left-[3cqw] h-[30cqw] w-[22cqw] drop-shadow-[0_0.4cqw_0.7cqw_rgba(0,0,0,0.3)]" />

      <div className="relative ml-[34cqw] flex h-full flex-col px-[4cqw] pt-[5cqw] pb-[4cqw]">
        <p className="self-end text-[1.35cqw] font-bold tracking-[0.08em] text-neutral-800">
          CERT NO. {cert.verificationCode}
        </p>

        <div className="flex flex-1 flex-col justify-center">
        <div className="text-center">
          <h1 className="font-[family-name:var(--font-cert-serif)] text-[4.6cqw] leading-none tracking-[0.06em] text-neutral-900">
            CERTIFICATE
          </h1>
          <div className="mt-[1cqw] flex items-center justify-center gap-[1.2cqw]">
            <span className="h-[0.12cqw] w-[7cqw] bg-[#c9a227]" />
            <span className="font-[family-name:var(--font-cert-serif)] text-[1.6cqw] tracking-[0.14em] text-neutral-700">
              OF COMPLETION
            </span>
            <span className="h-[0.12cqw] w-[7cqw] bg-[#c9a227]" />
          </div>
        </div>

        <p className="mt-[2cqw] text-center text-[1.1cqw] tracking-[0.28em] text-neutral-600">
          PROUDLY PRESENTED TO
        </p>

        <p className="mt-[0.4cqw] text-center font-[family-name:var(--font-cert-script)] text-[5.6cqw] leading-[1.2] text-neutral-900">
          {cert.studentName}
        </p>

        <p className="mt-[2.4cqw] text-[1.42cqw] leading-[1.75] text-neutral-800">
          This is to certify that <strong>{cert.studentName}</strong> has successfully completed
          an internship programme at <strong>{org}</strong>
          {period}.
        </p>

        {(programArea || citation) && (
          <p className="mt-[1cqw] text-[1.42cqw] leading-[1.75] text-neutral-800">
            {citation?.trim() ||
              `During the internship, they actively participated in key areas of ${programArea}, demonstrating dedication, professionalism and an eagerness to learn.`}
          </p>
        )}

        </div>

        <div className="flex items-end justify-between gap-[6cqw] pt-[2cqw]">
          <Signature name={chrome.left.name} title={chrome.left.title} script={false} />
          <Signature name={chrome.right.name} title={chrome.right.title} script={false} />
        </div>
      </div>

      <RevokedStamp revoked={cert.status === "REVOKED"} />
    </CertificateSheet>
  );
}
