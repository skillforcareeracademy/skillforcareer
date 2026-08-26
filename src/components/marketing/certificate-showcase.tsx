import { ShieldCheck } from "lucide-react";
import { CertificateDocument } from "@/components/certificate/certificate-document";
import { ButtonLink } from "@/components/shared/button-link";
import { iconFor } from "@/config/icons";
import type { HomeData } from "@/lib/validations/homepage";
import type { CertificateType } from "@/lib/validations/certificate";

/** A typed date that `format()` can't choke on, whatever the admin entered. */
function issuedAt(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

/** Home-page showcase of a sample certificate learners earn. */
export function CertificateShowcase({ data }: { data: HomeData<"certificate"> }) {
  return (
    <section className="bg-muted/30 border-y">
      <div className="container-page grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-2">
        <div className="max-w-lg">
          {data.badge && (
            <span className="text-primary inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-sm font-medium">
              <ShieldCheck className="size-4" /> {data.badge}
            </span>
          )}
          <h2 className="mt-4 text-3xl sm:text-4xl">{data.title}</h2>
          {data.description && (
            <p className="text-muted-foreground mt-3 text-lg">{data.description}</p>
          )}
          {data.perks.length > 0 && (
            <ul className="mt-6 space-y-3">
              {data.perks.map((perk, i) => {
                const Icon = iconFor(perk.icon, "BadgeCheck");
                return (
                  <li key={`${perk.text}-${i}`} className="flex items-start gap-2.5 text-sm">
                    <Icon className="text-primary mt-0.5 size-5 shrink-0" /> {perk.text}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-7 flex flex-wrap gap-3">
            {data.primaryLabel && (
              <ButtonLink href={data.primaryHref || "/courses"} size="lg">
                {data.primaryLabel}
              </ButtonLink>
            )}
            {data.secondaryLabel && (
              <ButtonLink href={data.secondaryHref || "/verify"} size="lg" variant="outline">
                <ShieldCheck className="size-4" /> {data.secondaryLabel}
              </ButtonLink>
            )}
          </div>
        </div>

        <div className="relative">
          <div className="rotate-1 transition-transform hover:rotate-0">
            {/* The verification code stays SAMPLE no matter what an admin types
                into the preview fields — a homepage mock-up must never look up
                as a real, verifiable certificate. */}
            <CertificateDocument
              cert={{
                type: data.sampleTemplate as CertificateType,
                studentName: data.sampleStudentName,
                courseTitle: data.sampleCourseTitle,
                serialNumber: data.sampleSerialNumber,
                verificationCode: "SAMPLE",
                issuedAt: issuedAt(data.sampleIssuedAt),
                status: "ISSUED",
                details: {
                  batchName: data.sampleBatchName,
                  citation: data.sampleDetail,
                  period: data.sampleDetail,
                  programArea: "",
                  organisation: "",
                  startDate: "",
                  endDate: "",
                },
              }}
            />
          </div>
          {data.sampleLabel && (
            <span className="bg-background absolute -top-3 left-6 rounded-full border px-3 py-1 text-xs font-medium shadow-sm">
              {data.sampleLabel}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
