import QRCode from "qrcode";
import { getBranding } from "@/server/services/branding-service";
import { getSettings } from "@/server/services/settings-service";
import { siteConfig } from "@/config/site";
import { certificateFontVars } from "@/lib/certificate-fonts";
import {
  CERTIFICATE_TYPE_META,
  parseCertificateDetails,
  type CertificateType,
} from "@/lib/validations/certificate";
import { cn } from "@/lib/utils";
import { ExcellenceCertificate } from "./templates/excellence";
import { AppreciationCertificate } from "./templates/appreciation";
import { InternshipCompletionCertificate } from "./templates/internship-completion";
import { InternshipAppreciationCertificate } from "./templates/internship-appreciation";
import type { CertificateChrome, CertificateRender } from "./templates/shared";

export type { CertificateRender } from "./templates/shared";

/**
 * What a caller has to hand over. `details` and `type` are optional so the
 * older two-field call sites (and anything reading a certificate issued before
 * the four designs existed) keep working and fall back to the course award.
 */
export interface CertificateData {
  studentName: string;
  courseTitle: string | null;
  serialNumber: string;
  verificationCode: string;
  issuedAt: string;
  status: string;
  type?: CertificateType;
  details?: unknown;
}

const TEMPLATES = {
  COURSE_COMPLETION: ExcellenceCertificate,
  INTERNSHIP_COMPLETION: InternshipCompletionCertificate,
  APPRECIATION: AppreciationCertificate,
  INTERNSHIP_APPRECIATION: InternshipAppreciationCertificate,
} as const satisfies Record<CertificateType, unknown>;

/** A verification QR that degrades to nothing rather than breaking the print. */
async function verifyQrSvg(url: string): Promise<string> {
  try {
    return await QRCode.toString(url, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#111111", light: "#00000000" },
    });
  } catch {
    return "";
  }
}

function origin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? siteConfig.url).replace(/\/$/, "");
}

/**
 * A print-ready certificate in whichever of the four designs it was issued in.
 *
 * Rendered on `/certificate/[code]`, printed to PDF from there, and reused for
 * the homepage showcase. The design is chosen by the award's type — the
 * document does not take a "template" argument, because which certificate this
 * *is* isn't a presentation choice.
 */
export async function CertificateDocument({
  cert,
  className,
}: {
  cert: CertificateData;
  className?: string;
}) {
  const type = cert.type ?? "COURSE_COMPLETION";
  const verifyUrl = `${origin()}/verify/${cert.verificationCode}`;

  const [{ logoUrl, siteName }, { settings }, qrSvg] = await Promise.all([
    getBranding(),
    getSettings(),
    verifyQrSvg(verifyUrl),
  ]);

  const render: CertificateRender = {
    type,
    studentName: cert.studentName,
    courseTitle: cert.courseTitle,
    serialNumber: cert.serialNumber,
    verificationCode: cert.verificationCode,
    issuedAt: cert.issuedAt,
    status: cert.status,
    details: parseCertificateDetails(cert.details),
  };

  const chrome: CertificateChrome = {
    logoUrl,
    siteName,
    qrSvg,
    verifyUrl,
    left: {
      name: settings.certLeftName,
      title: settings.certLeftTitle,
      signatureUrl: settings.certLeftSignatureUrl,
    },
    right: {
      name: settings.certRightName,
      title: settings.certRightTitle,
      signatureUrl: settings.certRightSignatureUrl,
    },
  };

  const Template = TEMPLATES[type];

  return (
    <div className={cn(certificateFontVars, className)}>
      <Template cert={render} chrome={chrome} />
    </div>
  );
}

/** The award's own heading — for page titles and list rows. */
export function certificateHeading(type: CertificateType | undefined): string {
  return CERTIFICATE_TYPE_META[type ?? "COURSE_COMPLETION"].heading;
}
