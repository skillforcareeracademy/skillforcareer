import { format } from "date-fns";
import type { CertificateDetails, CertificateType } from "@/lib/validations/certificate";
import { cn } from "@/lib/utils";

/** The award itself — the same shape whichever design prints it. */
export interface CertificateRender {
  type: CertificateType;
  studentName: string;
  courseTitle: string | null;
  serialNumber: string;
  verificationCode: string;
  issuedAt: string;
  status: string;
  details: CertificateDetails;
}

/** Everything that is the same on every certificate the academy issues. */
export interface CertificateChrome {
  logoUrl: string;
  siteName: string;
  /** Inline SVG for the verification QR, already sized to fill its box. */
  qrSvg: string;
  verifyUrl: string;
  left: Signatory;
  right: Signatory;
}

export interface Signatory {
  name: string;
  title: string;
  /** A scan of the real signature; blank means write the name in a hand. */
  signatureUrl: string;
}

export interface TemplateProps {
  cert: CertificateRender;
  chrome: CertificateChrome;
}

/** "14 January 2026", and never `Invalid Date` on the page. */
export function longDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : format(d, "d MMMM yyyy");
}

/**
 * The sheet every design is drawn on.
 *
 * Fixed at A4 landscape and scaled with a CSS variable rather than reflowed:
 * a certificate is a *document*, so the layout has to be identical on a phone,
 * on screen and on paper. `container-type: inline-size` plus `cqw` units means
 * every child sizes off the sheet's width, so nothing shifts when the sheet is
 * shown smaller.
 */
export function CertificateSheet({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      id="certificate"
      className={cn(
        "certificate-sheet relative mx-auto aspect-[297/210] w-full max-w-[297mm] overflow-hidden shadow-xl",
        className,
      )}
      style={{
        containerType: "inline-size",
        // Backgrounds and gold gradients are the design, not decoration —
        // browsers drop them from print by default.
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * A signature block.
 *
 * `script` decides whether a written hand appears above the rule. The academy's
 * course award carries one (their existing certificate has real signatures over
 * the printed names); the ribboned designs are ruled lines with the name
 * beneath, and repeating the name in both places just looked like a bug.
 */
export function Signature({
  signatory,
  tone = "dark",
  script = true,
}: {
  signatory: Signatory;
  tone?: "dark" | "light" | "navy";
  script?: boolean;
}) {
  const { name, title, signatureUrl } = signatory;
  const line =
    tone === "light" ? "bg-white/60" : tone === "navy" ? "bg-[#2c3e70]/40" : "bg-neutral-500";
  const text = tone === "light" ? "text-white" : "text-neutral-800";
  const sub = tone === "light" ? "text-white/75" : "text-neutral-500";

  return (
    <div className="text-center">
      {signatureUrl ? (
        // The real signature, wherever one has been uploaded — every design
        // uses it, including the sample on the homepage.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={signatureUrl}
          alt=""
          className="mx-auto mb-[0.4cqw] h-[4cqw] w-auto max-w-[16cqw] object-contain object-bottom"
        />
      ) : (
        script && (
          <p
            className={cn(
              "mb-[0.5cqw] font-[family-name:var(--font-cert-script)] text-[3.4cqw] leading-none whitespace-nowrap",
              text,
            )}
          >
            {name}
          </p>
        )
      )}
      <div className={cn("mx-auto h-px w-[17cqw]", line)} />
      <p
        className={cn(
          "mt-[0.7cqw] text-[1.2cqw] font-semibold tracking-[0.06em] whitespace-nowrap uppercase",
          text,
        )}
      >
        {name}
      </p>
      {/* The academy's own designs bracket the role on the ribboned awards and
          leave it bare under a written signature. */}
      <p className={cn("text-[1cqw] tracking-[0.08em] uppercase", sub)}>
        {script ? title : `(${title})`}
      </p>
    </div>
  );
}

/** The scannable verification mark, with its caption. */
export function VerifyQr({
  svg,
  caption = "Scan QR to view certificate",
  className,
  captionClassName,
}: {
  svg: string;
  caption?: string;
  className?: string;
  captionClassName?: string;
}) {
  return (
    <div className={cn("text-center", className)}>
      <div
        className="mx-auto size-[9cqw] [&>svg]:size-full"
        // The SVG is generated server-side by `qrcode` from our own verify URL —
        // no user input reaches it.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p
        className={cn(
          "mt-[0.5cqw] text-[0.85cqw] font-semibold text-neutral-600",
          captionClassName,
        )}
      >
        {caption}
      </p>
    </div>
  );
}

/** Struck across the sheet when an award has been withdrawn. */
export function RevokedStamp({ revoked }: { revoked: boolean }) {
  if (!revoked) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
      <span className="-rotate-12 rounded-[1cqw] border-[0.5cqw] border-red-600/70 px-[3cqw] py-[1cqw] text-[6cqw] font-black tracking-[0.2em] text-red-600/70 uppercase">
        Revoked
      </span>
    </div>
  );
}
