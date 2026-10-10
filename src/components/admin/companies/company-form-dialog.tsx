"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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

const SEATS = [
  ["maxStudents", "Learners"],
  ["maxInstructors", "Instructors"],
  ["maxAdmins", "Admins"],
  ["maxSalesAgents", "Sales agents"],
] as const;

type Form = {
  name: string;
  status: CompanyStatus;
  contactName: string;
  email: string;
  phone: string;
  notes: string;
  plan: string;
  subscriptionEndsAt: string;
  maxStudents: string;
  maxInstructors: string;
  maxAdmins: string;
  maxSalesAgents: string;
  razorpayKeyId: string;
  razorpayKeySecret: string;
  whatsappPhoneId: string;
  whatsappToken: string;
  senderEmail: string;
};

const BLANK: Form = {
  name: "",
  status: "ACTIVE",
  contactName: "",
  email: "",
  phone: "",
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
 * Adding a company, or changing what it is allowed.
 *
 * The owner row is the academy: its seats and subscription are meaningless and
 * are not offered. Secrets are write-only — the form is never sent the stored
 * ones back, so leaving a secret box empty means "leave it alone".
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
    company
      ? {
          ...BLANK,
          name: company.name,
          status: company.status as CompanyStatus,
          contactName: company.contactName ?? "",
          email: company.email ?? "",
          phone: company.phone ?? "",
          plan: company.plan ?? "",
          subscriptionEndsAt: company.subscriptionEndsAt?.slice(0, 10) ?? "",
          maxStudents: numText(company.limits.STUDENT),
          maxInstructors: numText(company.limits.INSTRUCTOR),
          maxAdmins: numText(company.limits.COMPANY_ADMIN),
          maxSalesAgents: numText(company.limits.SALES_AGENT),
        }
      : BLANK,
  );
  const [saving, setSaving] = useState(false);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{company ? company.name : "Add a company"}</DialogTitle>
          <DialogDescription>
            {isOwner
              ? "This is the academy itself. It has no seat limit and no subscription."
              : "Its admin sees only this company — its people, its batches, its money, and nothing else."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="co-name">Company name</Label>
              <Input
                id="co-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Webeside Technology"
              />
            </div>
            {!isOwner && (
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => v && set("status", v as CompanyStatus)}
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
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="co-contact">Contact</Label>
              <Input
                id="co-contact"
                value={form.contactName}
                onChange={(e) => set("contactName", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="co-email">Email</Label>
              <Input
                id="co-email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="co-phone">Phone</Label>
              <Input
                id="co-phone"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
          </div>

          {!isOwner && (
            <>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Seats</p>
                <p className="text-muted-foreground text-xs">
                  How many accounts of each kind this company may create. Leave
                  a box empty for no limit; zero forbids the kind outright.
                </p>
                <div className="grid gap-3 pt-1 sm:grid-cols-4">
                  {SEATS.map(([key, label]) => (
                    <div key={key} className="space-y-1.5">
                      <Label htmlFor={`co-${key}`}>{label}</Label>
                      <Input
                        id={`co-${key}`}
                        type="number"
                        min={0}
                        value={form[key]}
                        onChange={(e) => set(key, e.target.value)}
                        placeholder="No limit"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="co-plan">Subscription plan</Label>
                  <Input
                    id="co-plan"
                    value={form.plan}
                    onChange={(e) => set("plan", e.target.value)}
                    placeholder="e.g. Annual"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="co-ends">Renews on</Label>
                  <Input
                    id="co-ends"
                    type="date"
                    value={form.subscriptionEndsAt}
                    onChange={(e) => set("subscriptionEndsAt", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-sm font-medium">Their own accounts</p>
                <p className="text-muted-foreground text-xs">
                  Enrolments from this company&rsquo;s own website are paid into
                  their Razorpay, and their broadcasts go out from their own
                  WhatsApp and address. Secrets are never shown back — leave one
                  empty to keep what is stored.
                </p>
                <div className="grid gap-3 pt-1 sm:grid-cols-2">
                  <Input
                    value={form.razorpayKeyId}
                    onChange={(e) => set("razorpayKeyId", e.target.value)}
                    placeholder="Razorpay key id"
                    className="font-mono text-xs"
                  />
                  <Input
                    type="password"
                    value={form.razorpayKeySecret}
                    onChange={(e) => set("razorpayKeySecret", e.target.value)}
                    placeholder="Razorpay key secret"
                    className="font-mono text-xs"
                  />
                  <Input
                    value={form.whatsappPhoneId}
                    onChange={(e) => set("whatsappPhoneId", e.target.value)}
                    placeholder="WhatsApp phone number id"
                    className="font-mono text-xs"
                  />
                  <Input
                    type="password"
                    value={form.whatsappToken}
                    onChange={(e) => set("whatsappToken", e.target.value)}
                    placeholder="WhatsApp access token"
                    className="font-mono text-xs"
                  />
                  <Input
                    value={form.senderEmail}
                    onChange={(e) => set("senderEmail", e.target.value)}
                    placeholder="Sends broadcasts from"
                  />
                </div>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="co-notes">Notes</Label>
            <Textarea
              id="co-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="What was agreed, and with whom."
            />
          </div>
        </div>

        <DialogFooter>
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

const numText = (n: number | null | undefined) => (n == null ? "" : String(n));
const blankToUndefined = (v: string) => (v.trim() === "" ? undefined : Number(v));
