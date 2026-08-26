"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  CERTIFICATE_TYPE_META,
  type CertificateType,
} from "@/lib/validations/certificate";
import { toast } from "sonner";
import { GraduationCap, Copy, Check, Ban, RotateCcw, Trash2, ExternalLink } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface CertRow {
  id: string;
  serialNumber: string;
  verificationCode: string;
  status: string;
  type: string;
  studentName: string;
  studentEmail: string;
  studentAvatar: string | null;
  courseId: string | null;
  courseTitle: string | null;
  issuedAt: string;
}

export function CertificateDetailSheet({
  cert,
  onOpenChange,
  canManage = true,
}: {
  cert: CertRow | null;
  onOpenChange: (open: boolean) => void;
  /** Instructors get a read-only view — no revoke/reinstate/delete. */
  canManage?: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!cert) {
    return <Sheet open={false} onOpenChange={onOpenChange} />;
  }

  const revoked = cert.status === "REVOKED";
  const verifyUrl =
    typeof window !== "undefined" ? `${window.location.origin}/verify/${cert.verificationCode}` : "";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(verifyUrl);
      setCopied(true);
      toast.success("Verification link copied.");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy.");
    }
  }
  async function setStatus(status: "ISSUED" | "REVOKED") {
    setBusy(true);
    try {
      await api.patch(`/api/certificates/${cert!.id}`, { status });
      toast.success(status === "REVOKED" ? "Certificate revoked." : "Certificate reinstated.");
      router.refresh();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed.");
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api.del(`/api/certificates/${cert!.id}`);
      toast.success("Certificate deleted.");
      router.refresh();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
      setBusy(false);
    }
  }

  return (
    <Sheet open={cert != null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-6 pb-4">
          <SheetTitle>Certificate</SheetTitle>
          <SheetDescription className="font-mono text-xs">{cert.serialNumber}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 p-6">
          {/* Certificate preview */}
          <div
            className={cn(
              "relative overflow-hidden rounded-2xl border p-6 text-center",
              revoked
                ? "border-rose-200 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/20"
                : "border-rose-200/60 bg-gradient-to-br from-rose-50 to-pink-50 dark:border-rose-900/30 dark:from-rose-950/30 dark:to-pink-950/20",
            )}
          >
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow">
              <GraduationCap className="size-6" />
            </div>
            <p className="text-muted-foreground text-xs tracking-wide uppercase">
              {CERTIFICATE_TYPE_META[cert.type as CertificateType]?.heading ??
                "Certificate"}
            </p>
            <p className="mt-2 text-lg font-semibold">{cert.studentName}</p>
            {cert.courseTitle && (
              <>
                <p className="text-muted-foreground text-sm">has successfully completed</p>
                <p className="mt-1 font-medium">{cert.courseTitle}</p>
              </>
            )}
            <p className="text-muted-foreground mt-3 text-xs">
              Issued {format(new Date(cert.issuedAt), "d MMMM yyyy")}
            </p>
            {revoked && (
              <Badge
                variant="secondary"
                className="absolute top-3 right-3 bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
              >
                Revoked
              </Badge>
            )}
          </div>

          {/* Details */}
          <dl className="space-y-2.5 text-sm">
            <Row label="Learner" value={`${cert.studentName} · ${cert.studentEmail}`} />
            <Row
              label="Award"
              value={
                CERTIFICATE_TYPE_META[cert.type as CertificateType]?.label ?? cert.type
              }
            />
            {cert.courseTitle && <Row label="Course" value={cert.courseTitle} />}
            <Row label="Serial" value={cert.serialNumber} mono />
            <Row label="Verification code" value={cert.verificationCode} mono />
          </dl>

          {/* Verify link */}
          <div className="rounded-xl border p-3">
            <p className="mb-2 text-sm font-medium">Public verification</p>
            <div className="flex items-center gap-2">
              <code className="bg-muted flex-1 truncate rounded-md px-2.5 py-1.5 text-xs">{verifyUrl}</code>
              <Button type="button" variant="outline" size="sm" onClick={copyLink}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<a href={`/verify/${cert.verificationCode}`} target="_blank" rel="noopener" />}
                aria-label="Open verification page"
              >
                <ExternalLink className="size-4" />
              </Button>
            </div>
          </div>

          {/* Actions */}
          {canManage && (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              {revoked ? (
                <Button variant="outline" size="sm" disabled={busy} onClick={() => setStatus("ISSUED")}>
                  <RotateCcw className="size-4" /> Reinstate
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled={busy} onClick={() => setStatus("REVOKED")}>
                  <Ban className="size-4" /> Revoke
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={remove}
                className="text-destructive hover:text-destructive ml-auto"
              >
                <Trash2 className="size-4" /> Delete
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className={cn("text-right", mono && "font-mono text-xs")}>{value}</dd>
    </div>
  );
}
