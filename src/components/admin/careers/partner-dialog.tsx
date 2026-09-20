"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import type { PartnerRow } from "@/server/services/careers-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PartnerForm {
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  website: string;
  city: string;
  notes: string;
  isActive: boolean;
}

function toForm(p: PartnerRow | null): PartnerForm {
  return {
    name: p?.name ?? "",
    contactPerson: p?.contactPerson ?? "",
    email: p?.email ?? "",
    phone: p?.phone ?? "",
    website: p?.website ?? "",
    city: p?.city ?? "",
    notes: p?.notes ?? "",
    isActive: p?.isActive ?? true,
  };
}

/** Surface the first zod issue from the API, else its message. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback;
  const issues = (err.details as { issues?: { message: string }[] } | undefined)?.issues;
  return issues?.[0]?.message ?? err.message ?? fallback;
}

/**
 * Add or edit a partner company. Placement partners and hiring partners carry
 * the same details, so one dialog serves both — only the endpoint and wording
 * differ.
 */
export function PartnerDialog({
  open,
  onOpenChange,
  partner,
  basePath,
  noun,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null to add a new one. */
  partner: PartnerRow | null;
  /** e.g. /api/admin/careers/placement-partners */
  basePath: string;
  /** "placement partner" / "hiring partner" */
  noun: string;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {open && (
          // Remount per partner so the fields seed from the one being edited.
          <Body
            key={partner?.id ?? "new"}
            partner={partner}
            basePath={basePath}
            noun={noun}
            onDone={() => {
              onOpenChange(false);
              onSaved();
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  partner,
  basePath,
  noun,
  onDone,
  onCancel,
}: {
  partner: PartnerRow | null;
  basePath: string;
  noun: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<PartnerForm>(() => toForm(partner));
  const [saving, setSaving] = useState(false);

  function set<K extends keyof PartnerForm>(key: K, value: PartnerForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (partner) await api.patch(`${basePath}/${partner.id}`, form);
      else await api.post(basePath, form);
      toast.success(partner ? "Saved." : `${noun[0].toUpperCase()}${noun.slice(1)} added.`);
      onDone();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't save."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{partner ? `Edit ${noun}` : `Add a ${noun}`}</DialogTitle>
        <DialogDescription>
          Contact details stay inside the admin panel — they never appear on the website.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pp-name">Company name</Label>
          <Input
            id="pp-name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pp-person">Contact person</Label>
            <Input
              id="pp-person"
              value={form.contactPerson}
              onChange={(e) => set("contactPerson", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pp-phone">Phone</Label>
            <Input
              id="pp-phone"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              inputMode="tel"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pp-email">Email</Label>
            <Input
              id="pp-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pp-city">City</Label>
            <Input id="pp-city" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pp-web">Website</Label>
          <Input
            id="pp-web"
            value={form.website}
            onChange={(e) => set("website", e.target.value)}
            placeholder="https://"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pp-notes">Notes</Label>
          <Textarea
            id="pp-notes"
            rows={3}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Terms, fees, the roles they usually fill…"
          />
        </div>
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
          <span>
            <span className="font-medium">Active</span>
            <span className="text-muted-foreground block text-xs">
              Inactive partners stay on record but drop out of the assignment lists.
            </span>
          </span>
          <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || form.name.trim().length < 2}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {partner ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
