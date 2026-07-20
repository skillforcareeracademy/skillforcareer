import { ShieldCheck, BadgeCheck, Share2, Building2 } from "lucide-react";
import { CertificateDocument } from "@/components/certificate/certificate-document";
import { ButtonLink } from "@/components/shared/button-link";

const DEMO_CERT = {
  studentName: "Ananya Sharma",
  courseTitle: "Complete Data Science Bootcamp with Python",
  serialNumber: "SFC-2026-000420",
  verificationCode: "SAMPLE",
  issuedAt: "2026-02-14T00:00:00.000Z",
  status: "ISSUED",
};

const PERKS = [
  { icon: BadgeCheck, text: "Verifiable — a unique code anyone can check" },
  { icon: Share2, text: "Shareable on LinkedIn and your résumé" },
  { icon: Building2, text: "Recognised by hiring partners across India" },
];

/** Home-page showcase of a sample certificate learners earn. */
export function CertificateShowcase() {
  return (
    <section className="bg-muted/30 border-y">
      <div className="container-page grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-2">
        <div className="max-w-lg">
          <span className="text-primary inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-sm font-medium">
            <ShieldCheck className="size-4" /> Industry-recognised certificate
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl">Finish strong. Get certified.</h2>
          <p className="text-muted-foreground mt-3 text-lg">
            Complete your program and earn a verifiable SkillForCareer certificate — proof of the skills
            you&apos;ve built, ready to share with employers.
          </p>
          <ul className="mt-6 space-y-3">
            {PERKS.map((p) => (
              <li key={p.text} className="flex items-start gap-2.5 text-sm">
                <p.icon className="text-primary mt-0.5 size-5 shrink-0" /> {p.text}
              </li>
            ))}
          </ul>
          <div className="mt-7 flex flex-wrap gap-3">
            <ButtonLink href="/courses" size="lg">
              Start a course
            </ButtonLink>
            <ButtonLink href="/verify" size="lg" variant="outline">
              <ShieldCheck className="size-4" /> Verify a certificate
            </ButtonLink>
          </div>
        </div>

        <div className="relative">
          <div className="rotate-1 transition-transform hover:rotate-0">
            <CertificateDocument cert={DEMO_CERT} />
          </div>
          <span className="bg-background absolute -top-3 left-6 rounded-full border px-3 py-1 text-xs font-medium shadow-sm">
            Sample certificate
          </span>
        </div>
      </div>
    </section>
  );
}
