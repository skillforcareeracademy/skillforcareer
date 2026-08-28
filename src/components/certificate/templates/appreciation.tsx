import {
  CertificateSheet,
  RevokedStamp,
  Signature,
  type TemplateProps,
} from "./shared";

/**
 * The gold ribbon rosette that anchors the left of the sheet.
 *
 * Drawn rather than shipped as an image: a raster medal at print resolution is
 * a megabyte-and-a-half, and it would need re-exporting every time the brand
 * gold shifts. The scallop is generated so the tooth count can be tuned in one
 * number instead of by hand-editing forty path segments.
 */
function GoldRosette({ className }: { className?: string }) {
  const teeth = 24;
  const outer = 46;
  const inner = 39;
  const points = Array.from({ length: teeth * 2 }, (_, i) => {
    const angle = (Math.PI * i) / teeth - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    return `${(50 + r * Math.cos(angle)).toFixed(2)},${(50 + r * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");

  return (
    <svg viewBox="0 0 100 150" className={className} aria-hidden>
      <defs>
        <linearGradient id="rosette-ribbon" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f7e7b4" />
          <stop offset="45%" stopColor="#d4af37" />
          <stop offset="100%" stopColor="#a8801f" />
        </linearGradient>
        <linearGradient id="rosette-disc" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor="#fdf3d0" />
          <stop offset="35%" stopColor="#e8c765" />
          <stop offset="65%" stopColor="#c9a227" />
          <stop offset="100%" stopColor="#8f6d16" />
        </linearGradient>
        <radialGradient id="rosette-centre" cx="0.38" cy="0.32" r="0.8">
          <stop offset="0%" stopColor="#fff7dc" />
          <stop offset="55%" stopColor="#dfbb4e" />
          <stop offset="100%" stopColor="#9d7a1c" />
        </radialGradient>
      </defs>

      {/* Ribbon tails, tucked behind the medal. */}
      <path d="M32 78 L26 148 L44 132 L52 148 L52 78 Z" fill="url(#rosette-ribbon)" />
      <path d="M68 78 L74 148 L56 132 L48 148 L48 78 Z" fill="url(#rosette-ribbon)" opacity="0.9" />
      {/* Vertical hanger above the medal. */}
      <rect x="41" y="0" width="18" height="24" fill="url(#rosette-ribbon)" />

      <polygon points={points} fill="url(#rosette-disc)" />
      <circle cx="50" cy="50" r="33" fill="url(#rosette-centre)" />
      <circle cx="50" cy="50" r="33" fill="none" stroke="#8f6d16" strokeWidth="0.7" opacity="0.55" />
      <circle cx="50" cy="50" r="27" fill="none" stroke="#fff6d5" strokeWidth="0.7" opacity="0.5" />
      {/* A single soft highlight, top-left, where light would actually catch —
          radiating spokes read as a pie chart, not as metal. */}
      <ellipse cx="41" cy="39" rx="11" ry="7" fill="#fffaea" opacity="0.3" transform="rotate(-25 41 39)" />
    </svg>
  );
}

/** The gold sweep across the top-right corner. */
function GoldSwoosh() {
  return (
    <svg
      viewBox="0 0 1000 700"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full"
      aria-hidden
    >
      <defs>
        <linearGradient id="swoosh-a" x1="0" y1="0" x2="1" y2="0.4">
          <stop offset="0%" stopColor="#8f6d16" />
          <stop offset="40%" stopColor="#e3c469" />
          <stop offset="70%" stopColor="#c9a227" />
          <stop offset="100%" stopColor="#f4e6b8" />
        </linearGradient>
        <linearGradient id="swoosh-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f6efd9" />
          <stop offset="100%" stopColor="#e6d7a9" />
        </linearGradient>
      </defs>
      {/* A pale under-sweep, then the gold band riding on top of it. */}
      <path d="M0 0 H1000 V82 C760 28 420 106 0 66 Z" fill="url(#swoosh-b)" />
      <path
        d="M320 0 C610 56 770 22 1000 0 V42 C770 70 610 100 320 34 Z"
        fill="url(#swoosh-a)"
      />
    </svg>
  );
}

const DEFAULT_CITATION =
  "in recognition of outstanding dedication, a willingness to learn beyond regular hours, " +
  "and consistent commitment that has greatly contributed to academic and personal growth.";

/**
 * **Certificate of Appreciation** — cream and gold, for recognising the learner
 * rather than a syllabus. No course is named, so the citation carries the whole
 * meaning and gets the room to do it.
 */
export function AppreciationCertificate({ cert, chrome }: TemplateProps) {
  const citation = cert.details.citation?.trim() || DEFAULT_CITATION;

  return (
    <CertificateSheet className="bg-[#f2ece0] text-neutral-900">
      <GoldSwoosh />

      <div className="relative flex h-full">
        <div className="relative w-[22cqw] shrink-0">
          <GoldRosette className="absolute top-[13cqw] left-[1.5cqw] h-[44cqw] w-[22cqw] drop-shadow-[0_0.4cqw_0.6cqw_rgba(0,0,0,0.18)]" />
        </div>

        <div className="flex flex-1 flex-col px-[3cqw] pt-[3cqw] pb-[4cqw] text-center">
          <p className="self-end font-[family-name:var(--font-cert-serif)] text-[1.7cqw] tracking-[0.06em] text-neutral-800">
            CERT NO. {cert.verificationCode}
          </p>

          <div className="flex flex-1 flex-col justify-center">
          {/* One line, always: the phrase is fixed, so it is sized to fit the
              column rather than left to wrap into the gold. */}
          <h1 className="font-[family-name:var(--font-cert-serif)] text-[3.35cqw] leading-none tracking-[0.04em] whitespace-nowrap text-neutral-900">
            CERTIFICATE OF APPRECIATION
          </h1>

          <p className="mt-[2cqw] text-[1.6cqw] text-neutral-700">
            This certificate is proudly presented to
          </p>

          <p className="mt-[0.6cqw] font-[family-name:var(--font-cert-script)] text-[5.6cqw] leading-[1.2] text-neutral-900">
            {cert.studentName}
          </p>

          {/* The diamond rule from the academy's own design. */}
          <div className="mt-[1cqw] flex items-center justify-center gap-[0.8cqw]">
            <span className="size-[0.6cqw] rotate-45 bg-neutral-800" />
            <span className="h-px w-[12cqw] bg-neutral-800" />
            <span className="size-[0.7cqw] rotate-45 border-[0.12cqw] border-neutral-800" />
            <span className="h-px w-[12cqw] bg-neutral-800" />
            <span className="size-[0.6cqw] rotate-45 bg-neutral-800" />
          </div>

          <p className="mx-auto mt-[2.2cqw] max-w-[56cqw] text-[1.5cqw] leading-[1.7] text-neutral-800">
            {citation}
          </p>

          <p className="mx-auto mt-[1.2cqw] max-w-[56cqw] text-[1.5cqw] leading-[1.7] text-neutral-800">
            We truly appreciate your outstanding performance while studying at {chrome.siteName}.
          </p>
          </div>

          <div className="flex items-end justify-center gap-[12cqw] pt-[2cqw]">
            <Signature signatory={chrome.left} bracketRole />
            <Signature signatory={chrome.right} bracketRole />
          </div>
        </div>
      </div>

      <RevokedStamp revoked={cert.status === "REVOKED"} />
    </CertificateSheet>
  );
}
