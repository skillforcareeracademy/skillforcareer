"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Award, Copy, ExternalLink, ShieldCheck, GraduationCap, BadgeCheck, Download } from "lucide-react";
import { toast } from "sonner";
import type { StudentCertificate } from "@/server/services/certificate-service";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/shared/button-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function StudentCertificatesClient({
  certificates,
}: {
  certificates: StudentCertificate[];
}) {
  const active = certificates.filter((c) => c.status === "ISSUED").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My certificates"
        description="Your verified credentials — share them or download for your records."
      />

      {certificates.length === 0 ? (
        <EmptyState
          icon={Award}
          title="No certificates yet"
          description="Complete a course to earn a verifiable certificate. It'll appear here automatically."
          action={<ButtonLink href="/student/learning">Go to My Learning</ButtonLink>}
        />
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            {active} verified {active === 1 ? "certificate" : "certificates"} earned
          </p>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {certificates.map((c) => (
              <CertificateCard key={c.id} c={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CertificateCard({ c }: { c: StudentCertificate }) {
  const [copied, setCopied] = useState(false);
  const revoked = c.status === "REVOKED";

  async function copyLink() {
    const url = `${window.location.origin}/verify/${c.verificationCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Verification link copied.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy link.");
    }
  }

  return (
    <Card className="gap-0 overflow-hidden p-0">
      {/* Certificate preview */}
      <div
        className={`relative border-b p-6 ${
          revoked
            ? "bg-muted"
            : "bg-gradient-to-br from-rose-50 to-pink-100 dark:from-rose-950/40 dark:to-pink-950/30"
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`flex size-9 items-center justify-center rounded-lg ${
                revoked ? "bg-muted-foreground/20" : "bg-primary text-primary-foreground"
              }`}
            >
              <GraduationCap className="size-5" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">SkillForCareer</p>
              <p className="text-muted-foreground text-[11px]">Certificate of Completion</p>
            </div>
          </div>
          {revoked ? (
            <Badge variant="destructive">Revoked</Badge>
          ) : (
            <Badge className="gap-1 bg-emerald-600 text-white">
              <BadgeCheck className="size-3" /> Verified
            </Badge>
          )}
        </div>

        <p className="text-muted-foreground mt-5 text-xs">This certifies that</p>
        <p className="text-lg font-semibold">{c.studentName}</p>
        <p className="text-muted-foreground mt-2 text-xs">has successfully completed</p>
        <p className="leading-snug font-medium">{c.courseTitle}</p>
      </div>

      {/* Meta + actions */}
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Serial</p>
            <p className="font-mono text-xs font-medium">{c.serialNumber}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Issued</p>
            <p className="font-medium">{format(new Date(c.issuedAt), "d MMM yyyy")}</p>
          </div>
          <div className="col-span-2">
            <p className="text-muted-foreground text-xs">Verification code</p>
            <p className="font-mono text-xs font-medium">{c.verificationCode}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/certificate/${c.verificationCode}`} size="sm">
            <Download className="size-4" /> Download
          </ButtonLink>
          <ButtonLink href={`/verify/${c.verificationCode}`} size="sm" variant="outline">
            <ExternalLink className="size-4" /> View
          </ButtonLink>
          <Button size="sm" variant="outline" onClick={copyLink}>
            {copied ? <ShieldCheck className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
