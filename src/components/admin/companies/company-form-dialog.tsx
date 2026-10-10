"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CreditCard,
  Loader2,
  Plug,
  ReceiptText,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import {
  COMPANY_STATUSES,
  COMPANY_STATUS_LABEL,
  type CompanyStatus,
} from "@/lib/validations/company";
import type { CompanyRow } from "@/server/services/company-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ImageUpload } from "@/components/shared/image-upload";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** The metered kinds, in the order the seats panel shows them. */
const SEATS = [
  ["maxStudents", "Learners", "STUDENT"],
  ["maxInstructors", "Instructors", "INSTRUCTOR"],
  ["maxAdmins", "Admins", "COMPANY_ADMIN"],
  ["maxSalesAgents", "Sales agents", "SALES_AGENT"],
] as const;

type Form = Record<string, string> & { status: CompanyStatus };

const BLANK: Form = {
  name: "",
  status: "ACTIVE",
  contactName: "",
  email: "",
  phone: "",
  website: "",
  logoUrl: "",
  addressLine: "",
  city: "",
  state: "",
  postcode: "",
  gstNumber: "",
  billingEmail: "",
  notes: "",
  plan: "",
  subscriptionEndsAt: "",
  maxStudents: "",
  maxInstructors: "",
  maxAdmins: "",
  maxSalesAgents: "",
  razorpayKeyId: "",
  razorpayKeySecret: "",
  whatsappPhoneId: "",
  whatsappToken: "",
  senderEmail: "",
};

/**
 * A company's account with the academy.
 *
 * Four tabs rather than one long scroll: who they are, what they have bought,
 * what they are billed as, and which of their own services the platform
 * should use. A seat box sits beside the number already used, because the
 * question being answered while typing it is "can I lower this?".
 *
 * Every field here is named and `autoComplete`-tagged on purpose. Left alone,
 * Chrome reads an unlabelled pair of boxes as a login and fills the operator's
 * own Gmail address and saved password into the Razorpay key — which is both
 * wrong data and a password in a place it should never be.
 */
export function CompanyFormDialog({
  company,
  open,
  onOpenChange,
}: {
  company: CompanyRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const isOwner = Boolean(company?.isOwner);
  const [form, setForm] = useState<Form>(() =>
    company ? fromCompany(company) : BLANK,
  );
  const [saving, setSaving] = useState(false);

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (form.name.trim().length < 2) {
      toast.error("Give the company a name.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...form,
        maxStudents: blankToUndefined(form.maxStudents),
        maxInstructors: blankToUndefined(form.maxInstructors),
        maxAdmins: blankToUndefined(form.maxAdmins),
        maxSalesAgents: blankToUndefined(form.maxSalesAgents),
      };
      const res = company
        ? await api.patch<{ message: string }>(
            `/api/companies/${company.id}`,
            body,
          )
        : await api.post<{ message: string }>("/api/companies", body);
      toast.success(res.message);
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't save that.",
      );
    } finally {
      setSaving(false);
    }
  }

  const text = (
    key: string,
    label: string,
    opts: { placeholder?: string; hint?: string; mono?: boolean; type?: string } = {},
  ) => (
    <Field label={label} htmlFor={`co-${key}`} hint={opts.hint}>
      <Input
        id={`co-${key}`}
        name={`company-${key}`}
        // Named for what it is and marked off, so the browser does not decide
        // this is a login form and fill it with the operator's own credentials.
        autoComplete="off"
        type={opts.type}
        value={form[key] ?? ""}
        onChange={(e) => set(key, e.target.value)}
        placeholder={opts.placeholder}
        className={opts.mono ? "font-mono text-xs" : undefined}
      />
    </Field>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="size-4" />
            {company ? company.name : "Add a company"}
            {isOwner && (
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                The academy
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {isOwner
              ? "This is the academy itself — the tenant that sees all the others. It has no seat limit and no subscription."
              : "Its admin sees only this company: its people, its batches, its money, and nothing else."}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <TabsList>
            <TabsTrigger value="details" className="gap-1.5 px-3">
              <Building2 /> Details
            </TabsTrigger>
            {!isOwner && (
              <TabsTrigger value="plan" className="gap-1.5 px-3">
                <Users /> Seats &amp; plan
              </TabsTrigger>
            )}
            {!isOwner && (
              <TabsTrigger value="billing" className="gap-1.5 px-3">
                <ReceiptText /> Billing
              </TabsTrigger>
            )}
            {!isOwner && (
              <TabsTrigger value="integrations" className="gap-1.5 px-3">
                <Plug /> Integrations
              </TabsTrigger>
            )}
          </TabsList>

          {/* ── Who they are ──────────────────────────────────────────────── */}
          <TabsContent value="details" className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {text("name", "Company name", { placeholder: "e.g. Webeside Technology" })}
              {!isOwner && (
                <Field label="Status" hint="Suspending locks everyone here out, and keeps every record.">
                  <Select
                    value={form.status}
                    onValueChange={(v) => v && set("status", v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v) => COMPANY_STATUS_LABEL[v as CompanyStatus]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {COMPANY_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {COMPANY_STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </div>

            <Field label="Logo" hint="Shown beside the company wherever it appears.">
              <ImageUpload
                value={form.logoUrl}
                onChange={(url) => set("logoUrl", url)}
                label="logo"
                previewClassName="size-14"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              {text("contactName", "Main contact", { placeholder: "Who the academy deals with" })}
              {text("website", "Website", { placeholder: "company.com" })}
              {text("email", "Email", { type: "email", placeholder: "contact@company.com" })}
              {text("phone", "Phone", { type: "tel" })}
            </div>

            <Field label="Notes" htmlFor="co-notes" hint="Only the academy sees these.">
              <Textarea
                id="co-notes"
                name="company-notes"
                rows={3}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="What was agreed, and with whom."
              />
            </Field>
          </TabsContent>

          {/* ── What they have bought ─────────────────────────────────────── */}
          {!isOwner && (
            <TabsContent value="plan" className="mt-4 space-y-5">
              <div className="space-y-2">
                <p className="text-sm font-medium">Seats</p>
                <p className="text-muted-foreground text-xs">
                  How many accounts of each kind this company may create. Leave
                  a box empty for no limit; zero forbids the kind outright.
                  Counted against the real accounts, so a seat freed by a
                  deletion is immediately available again.
                </p>
                <div className="grid gap-4 pt-1 sm:grid-cols-4">
                  {SEATS.map(([key, label, role]) => {
                    const used = company?.seats?.[role] ?? 0;
                    const limit = blankToUndefined(form[key]);
                    const over = limit !== undefined && used > limit;
                    return (
                      <Field
                        key={key}
                        label={label}
                        htmlFor={`co-${key}`}
                        hint={
                          company
                            ? over
                              ? `${used} already here — above this limit`
                              : `${used} used`
                            : undefined
                        }
                        tone={over ? "warn" : undefined}
                      >
                        <Input
                          id={`co-${key}`}
                          name={`company-${key}`}
                          autoComplete="off"
                          type="number"
                          min={0}
                          value={form[key]}
                          onChange={(e) => set(key, e.target.value)}
                          placeholder="No limit"
                        />
                      </Field>
                    );
                  })}
                </div>
                <p className="text-muted-foreground text-xs">
                  Lowering a limit below what is already there blocks new
                  accounts; nobody is removed.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {text("plan", "Subscription plan", { placeholder: "e.g. Annual" })}
                <Field label="Renews on" htmlFor="co-subscriptionEndsAt">
                  <Input
                    id="co-subscriptionEndsAt"
                    name="company-renews"
                    autoComplete="off"
                    type="date"
                    value={form.subscriptionEndsAt}
                    onChange={(e) => set("subscriptionEndsAt", e.target.value)}
                  />
                </Field>
              </div>
            </TabsContent>
          )}

          {/* ── How they are invoiced ─────────────────────────────────────── */}
          {!isOwner && (
            <TabsContent value="billing" className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {text("billingEmail", "Accounts email", {
                  type: "email",
                  hint: "Where invoices go, if not the contact above.",
                })}
                {text("gstNumber", "GSTIN", {
                  placeholder: "29ABCDE1234F1Z5",
                  mono: true,
                  hint: "15 characters. Checked before saving.",
                })}
              </div>
              {text("addressLine", "Registered address")}
              <div className="grid gap-4 sm:grid-cols-3">
                {text("city", "City")}
                {text("state", "State")}
                {text("postcode", "PIN code")}
              </div>
            </TabsContent>
          )}

          {/* ── Their own services ────────────────────────────────────────── */}
          {!isOwner && (
            <TabsContent value="integrations" className="mt-4 space-y-5">
              <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-xs">
                Secrets are stored but never shown back. Leaving one empty keeps
                whatever is already saved; to clear one, overwrite it.
              </p>

              <div className="space-y-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <CreditCard className="size-4" /> Razorpay
                </p>
                <p className="text-muted-foreground text-xs">
                  Enrolments from this company&rsquo;s own website are paid into
                  this account, not the academy&rsquo;s.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {text("razorpayKeyId", "Key ID", {
                    placeholder: "rzp_live_…",
                    mono: true,
                  })}
                  <Field label="Key secret" htmlFor="co-razorpayKeySecret">
                    <Input
                      id="co-razorpayKeySecret"
                      name="company-razorpay-secret"
                      type="password"
                      // `new-password`, not `off`: Chrome ignores `off` on a
                      // password field and offers a saved login anyway.
                      autoComplete="new-password"
                      value={form.razorpayKeySecret}
                      onChange={(e) => set("razorpayKeySecret", e.target.value)}
                      placeholder={company ? "Unchanged" : "Paste the secret"}
                      className="font-mono text-xs"
                    />
                  </Field>
                </div>
              </div>

              <div className="space-y-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Plug className="size-4" /> WhatsApp &amp; email
                </p>
                <p className="text-muted-foreground text-xs">
                  Their own WhatsApp Business and sending address, so broadcasts
                  reach their people as them. Without these they can still send
                  a dashboard notice.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {text("whatsappPhoneId", "WhatsApp phone number ID", {
                    mono: true,
                  })}
                  <Field label="WhatsApp access token" htmlFor="co-whatsappToken">
                    <Input
                      id="co-whatsappToken"
                      name="company-wa-token"
                      type="password"
                      autoComplete="new-password"
                      value={form.whatsappToken}
                      onChange={(e) => set("whatsappToken", e.target.value)}
                      placeholder={company ? "Unchanged" : "Paste the token"}
                      className="font-mono text-xs"
                    />
                  </Field>
                </div>
                {text("senderEmail", "Broadcasts are sent from", {
                  type: "email",
                  placeholder: "noreply@company.com",
                })}
              </div>
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter className="border-t px-6 py-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {company ? "Save changes" : "Add company"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  tone,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  tone?: "warn";
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && (
        <p
          className={
            tone === "warn"
              ? "text-xs text-amber-600 dark:text-amber-400"
              : "text-muted-foreground text-xs"
          }
        >
          {hint}
        </p>
      )}
    </div>
  );
}

function fromCompany(c: CompanyRow): Form {
  return {
    ...BLANK,
    name: c.name,
    status: c.status as CompanyStatus,
    contactName: c.contactName ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    website: c.website ?? "",
    logoUrl: c.logoUrl ?? "",
    addressLine: c.addressLine ?? "",
    city: c.city ?? "",
    state: c.state ?? "",
    postcode: c.postcode ?? "",
    gstNumber: c.gstNumber ?? "",
    billingEmail: c.billingEmail ?? "",
    notes: c.notes ?? "",
    plan: c.plan ?? "",
    subscriptionEndsAt: c.subscriptionEndsAt?.slice(0, 10) ?? "",
    maxStudents: numText(c.limits.STUDENT),
    maxInstructors: numText(c.limits.INSTRUCTOR),
    maxAdmins: numText(c.limits.COMPANY_ADMIN),
    maxSalesAgents: numText(c.limits.SALES_AGENT),
  };
}

const numText = (n: number | null | undefined) => (n == null ? "" : String(n));
const blankToUndefined = (v: string) =>
  v.trim() === "" ? undefined : Number(v);
