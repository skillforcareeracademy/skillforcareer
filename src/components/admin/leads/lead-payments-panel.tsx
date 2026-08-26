"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  BadgeIndianRupee,
  Check,
  Copy,
  Link2,
  Loader2,
  MessageCircle,
  Receipt,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/validations/payment";
import { contactHref } from "@/lib/validations/lead";
import type {
  LeadPaymentContext,
  LeadPaymentSummary,
} from "@/server/services/lead-payment-service";
import type { CourseOption } from "@/components/admin/leads/lead-form";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const NO_COURSE = "none";

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "PAID"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      : status === "FAILED"
        ? "bg-destructive/10 text-destructive"
        : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";
  return (
    <Badge variant="secondary" className={tone}>
      {PAYMENT_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

/**
 * Taking money from inside the CRM.
 *
 * Two buttons, because counsellors collect two ways: cash or a UPI transfer at
 * the desk, which they *record*; and everyone else, who gets a link on WhatsApp
 * and pays themselves. Either way the lead becomes a learner account on the
 * spot — that is the whole point, and it is why the email field is required
 * rather than optional.
 */
export function LeadPaymentsPanel({
  leadId,
  leadName,
  leadPhone,
  leadWhatsapp,
  courses,
  onChanged,
}: {
  leadId: string;
  leadName: string;
  leadPhone: string;
  leadWhatsapp: string | null;
  courses: CourseOption[];
  onChanged: () => void;
}) {
  const [ctx, setCtx] = useState<LeadPaymentContext | null>(null);
  const [email, setEmail] = useState("");
  const [courseId, setCourseId] = useState(NO_COURSE);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("CASH");
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [busy, setBusy] = useState<"collect" | "link" | null>(null);
  const [copied, setCopied] = useState(false);

  function load(seed = false) {
    return api
      .get<LeadPaymentContext>(`/api/leads/${leadId}/payments`)
      .then((data) => {
        setCtx(data);
        if (seed) {
          setEmail(data.student?.email ?? data.email ?? "");
          setCourseId(data.courseId ?? NO_COURSE);
          if (data.suggestedAmount != null) setAmount(String(data.suggestedAmount));
        }
      })
      .catch(() => toast.error("Couldn't load this lead's payments."));
  }

  useEffect(() => {
    void load(true);
    // Seeded once per lead; the panel is remounted when the sheet changes lead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  const body = () => ({
    email: email.trim(),
    courseId: courseId === NO_COURSE ? "" : courseId,
    amount: Number(amount),
  });

  function guard(): boolean {
    if (!email.trim()) {
      toast.error("A learner account needs an email address to sign in with.");
      return false;
    }
    if (!(Number(amount) > 0)) {
      toast.error("Enter the amount to collect.");
      return false;
    }
    return true;
  }

  async function collect() {
    if (!guard()) return;
    setBusy("collect");
    try {
      const res = await api.post<{ studentCreated: boolean }>(
        `/api/leads/${leadId}/payments`,
        { ...body(), method, type: "ONE_TIME" },
      );
      toast.success(
        res.studentCreated
          ? `Payment recorded — ${leadName} is now a student.`
          : "Payment recorded.",
      );
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't record the payment.");
    } finally {
      setBusy(null);
    }
  }

  async function createLink() {
    if (!guard()) return;
    setBusy("link");
    try {
      await api.post(`/api/leads/${leadId}/payment-link`, {
        ...body(),
        expiresInDays: Number(expiresInDays),
      });
      toast.success("Payment link ready — share it below.");
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't create the link.");
    } finally {
      setBusy(null);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the link and copy it by hand.");
    }
  }

  function shareOnWhatsapp(payment: LeadPaymentSummary) {
    const message =
      `Hi ${leadName.split(" ")[0]}, here's your payment link for ` +
      `${inr(payment.netAmount)}${payment.courseTitle ? ` (${payment.courseTitle})` : ""}: ` +
      `${payment.linkUrl}`;
    const base = contactHref(leadWhatsapp?.trim() || leadPhone, "WHATSAPP");
    window.open(`${base}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  }

  if (!ctx) {
    return (
      <div className="space-y-3 pt-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const liveLink = ctx.payments.find((p) => p.linkUrl);

  return (
    <div className="space-y-5 pt-4">
      {ctx.student && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/25 dark:bg-emerald-500/10">
          <UserCheck className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="min-w-0 text-sm">
            <p className="font-medium">Enrolled as a student</p>
            <p className="text-muted-foreground truncate text-xs">
              {ctx.student.email} · {inr(ctx.paidTotal)} received
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            className="ml-auto shrink-0"
            render={<a href={`/admin/users/${ctx.student.id}`} />}
          >
            Open profile
          </Button>
        </div>
      )}

      {/* ── Take a payment ─────────────────────────────────────────────── */}
      <div className="space-y-4 rounded-xl border p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="lp-email">Student email</Label>
            <Input
              id="lp-email"
              type="email"
              value={email}
              disabled={ctx.student != null}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@example.com"
            />
            <p className="text-muted-foreground text-xs">
              {ctx.student
                ? "This lead already has a learner account."
                : "Creates the learner account. They set a password from the sign-in page using “Forgot password”."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lp-amount">Amount (₹)</Label>
            <Input
              id="lp-amount"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Course</Label>
            <Select value={courseId} onValueChange={(v) => setCourseId(v ?? NO_COURSE)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No course" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_COURSE}>No course (fees only)</SelectItem>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Picking a course enrols them on it when the payment lands.
            </p>
          </div>
        </div>

        <Separator />

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Money already in hand */}
          <div className="space-y-2">
            <div className="space-y-1.5">
              <Label>Paid by</Label>
              <Select value={method} onValueChange={(v) => setMethod(v ?? "CASH")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_METHOD_LABEL[m] ?? m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={collect} disabled={busy != null} className="w-full">
              {busy === "collect" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <BadgeIndianRupee className="size-4" />
              )}
              Pay now — record it
            </Button>
            <p className="text-muted-foreground text-xs">
              For money you already have: cash at the desk, a UPI transfer you
              can see.
            </p>
          </div>

          {/* Let them pay themselves */}
          <div className="space-y-2">
            <div className="space-y-1.5">
              <Label htmlFor="lp-expiry">Link valid for (days)</Label>
              <Input
                id="lp-expiry"
                type="number"
                min={1}
                max={90}
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
              />
            </div>
            <Button
              onClick={createLink}
              disabled={busy != null}
              variant="outline"
              className="w-full"
            >
              {busy === "link" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Link2 className="size-4" />
              )}
              Share a payment link
            </Button>
            <p className="text-muted-foreground text-xs">
              Opens a page with no sign-in — they pay by card, UPI or netbanking.
            </p>
          </div>
        </div>
      </div>

      {/* ── The live link ──────────────────────────────────────────────── */}
      {liveLink?.linkUrl && (
        <div className="space-y-2 rounded-xl border p-3">
          <p className="text-sm font-medium">
            Payment link · {inr(liveLink.netAmount)}
          </p>
          <div className="flex items-center gap-2">
            <Input readOnly value={liveLink.linkUrl} className="font-mono text-xs" />
            <Button
              variant="outline"
              size="icon"
              onClick={() => copy(liveLink.linkUrl as string)}
              aria-label="Copy payment link"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => shareOnWhatsapp(liveLink)}
              aria-label="Send the link on WhatsApp"
            >
              <MessageCircle className="size-4" />
            </Button>
          </div>
          {liveLink.linkExpiresAt && (
            <p className="text-muted-foreground text-xs">
              Expires {format(new Date(liveLink.linkExpiresAt), "d MMM yyyy")}
            </p>
          )}
        </div>
      )}

      {/* ── History ────────────────────────────────────────────────────── */}
      {ctx.payments.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing collected against this lead yet.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {ctx.payments.map((p) => (
            <li key={p.id} className="flex items-center gap-3 p-3">
              <Receipt className="text-muted-foreground size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {inr(p.netAmount)}
                  {p.courseTitle && (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      · {p.courseTitle}
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {p.invoiceNumber}
                  {p.method ? ` · ${PAYMENT_METHOD_LABEL[p.method] ?? p.method}` : ""}
                  {" · "}
                  {format(new Date(p.paidAt ?? p.createdAt), "d MMM yyyy")}
                </p>
              </div>
              <StatusBadge status={p.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
