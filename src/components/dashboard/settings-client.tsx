"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  AtSign,
  Award,
  Bell,
  Camera,
  Globe,
  Hash,
  Loader2,
  Palette,
  RotateCcw,
  Save,
  Share2,
  ShieldCheck,
  Store,
  Video,
} from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import type { Settings } from "@/lib/validations/settings";
import type { SettingsWithMeta } from "@/server/services/settings-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { ImageUpload } from "@/components/shared/image-upload";
import { PhoneInput } from "@/components/shared/phone-input";

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];
const LOCALES = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
];
const CURRENCIES = [
  { value: "INR", label: "₹ Indian Rupee (INR)" },
  { value: "USD", label: "$ US Dollar (USD)" },
  { value: "EUR", label: "€ Euro (EUR)" },
  { value: "GBP", label: "£ British Pound (GBP)" },
  { value: "AED", label: "د.إ UAE Dirham (AED)" },
  { value: "SGD", label: "$ Singapore Dollar (SGD)" },
];

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  );
}

const TAB_TRIGGER = "gap-1.5 px-3";

export function SettingsClient({ data }: { data: SettingsWithMeta }) {
  const router = useRouter();
  const initial = data.settings;
  const [form, setForm] = useState<Settings>(initial);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initial),
    [form, initial],
  );

  async function onSave() {
    setSaving(true);
    try {
      await api.patch("/api/settings", form);
      toast.success("Settings saved.");
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError) {
        const d = e.details as { issues?: { message: string }[] } | undefined;
        toast.error(d?.issues?.[0]?.message ?? e.message);
      } else toast.error("Couldn't save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Configure your platform's identity, access rules and notifications."
        actions={
          <div className="flex items-center gap-2">
            {dirty && (
              <Badge variant="secondary" className="hidden sm:inline-flex">
                Unsaved changes
              </Badge>
            )}
            <Button
              variant="ghost"
              onClick={() => setForm(initial)}
              disabled={!dirty || saving}
            >
              <RotateCcw className="size-4" />
              Reset
            </Button>
            <Button onClick={onSave} disabled={!dirty || saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save changes
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="general">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="general" className={TAB_TRIGGER}>
            <Store /> General
          </TabsTrigger>
          <TabsTrigger value="branding" className={TAB_TRIGGER}>
            <Palette /> Branding
          </TabsTrigger>
          <TabsTrigger value="access" className={TAB_TRIGGER}>
            <ShieldCheck /> Access
          </TabsTrigger>
          <TabsTrigger value="notifications" className={TAB_TRIGGER}>
            <Bell /> Notifications
          </TabsTrigger>
          <TabsTrigger value="certificates" className={TAB_TRIGGER}>
            <Award /> Certificates
          </TabsTrigger>
          <TabsTrigger value="social" className={TAB_TRIGGER}>
            <Share2 /> Social
          </TabsTrigger>
        </TabsList>

        {/* ── General ─────────────────────────────────────────────────────── */}
        <TabsContent value="general" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>General</CardTitle>
              <CardDescription>
                Basic identity and localisation for the platform.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Site name" htmlFor="siteName">
                  <Input
                    id="siteName"
                    value={form.siteName}
                    onChange={(e) => set("siteName", e.target.value)}
                  />
                </Field>
                <Field label="Support email" htmlFor="supportEmail">
                  <Input
                    id="supportEmail"
                    type="email"
                    value={form.supportEmail}
                    onChange={(e) => set("supportEmail", e.target.value)}
                    placeholder="support@example.com"
                  />
                </Field>
              </div>
              <Field
                label="Tagline"
                htmlFor="tagline"
                hint="Appears in the browser title and marketing header."
              >
                <Input
                  id="tagline"
                  value={form.tagline}
                  onChange={(e) => set("tagline", e.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Contact phone" htmlFor="contactPhone">
                  <PhoneInput
                    id="contactPhone"
                    value={form.contactPhone}
                    onChange={(v) => set("contactPhone", v)}
                  />
                </Field>
                <Field label="Default currency">
                  <Select
                    value={form.currency}
                    onValueChange={(v) => v && set("currency", v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Default timezone">
                  <Select
                    value={form.defaultTimezone}
                    onValueChange={(v) => v && set("defaultTimezone", v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Default language">
                  <Select
                    value={form.defaultLocale}
                    onValueChange={(v) => v && set("defaultLocale", v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LOCALES.map((l) => (
                        <SelectItem key={l.value} value={l.value}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Branding ────────────────────────────────────────────────────── */}
        <TabsContent value="branding" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Branding</CardTitle>
              <CardDescription>
                Logo, favicon and the accent colour used across the platform.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Field label="Logo" hint="Shown in the header and on auth pages.">
                <ImageUpload
                  label="logo"
                  value={form.logoUrl}
                  onChange={(url) => set("logoUrl", url)}
                />
              </Field>
              <Separator />
              <Field label="Favicon" hint="The small icon shown in browser tabs.">
                <ImageUpload
                  label="favicon"
                  value={form.faviconUrl}
                  onChange={(url) => set("faviconUrl", url)}
                  previewClassName="size-12"
                />
              </Field>
              <Separator />
              <Field
                label="Primary colour"
                htmlFor="primaryColor"
                hint="Used for buttons, links and highlights."
              >
                <div className="flex items-center gap-3">
                  <input
                    aria-label="Pick primary colour"
                    type="color"
                    value={form.primaryColor}
                    onChange={(e) => set("primaryColor", e.target.value)}
                    className="size-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
                  />
                  <Input
                    id="primaryColor"
                    value={form.primaryColor}
                    onChange={(e) => set("primaryColor", e.target.value)}
                    className="w-32 font-mono uppercase"
                    maxLength={7}
                  />
                </div>
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Access ──────────────────────────────────────────────────────── */}
        <TabsContent value="access" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Registration &amp; access</CardTitle>
              <CardDescription>
                Control who can sign up and how the platform behaves.
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              <ToggleRow
                label="Allow public registration"
                description="Let visitors create their own accounts from the sign-up page."
                checked={form.allowRegistration}
                onChange={(v) => set("allowRegistration", v)}
              />
              <ToggleRow
                label="Require email verification"
                description="New users must verify their email via OTP before signing in."
                checked={form.requireEmailVerification}
                onChange={(v) => set("requireEmailVerification", v)}
              />
              <div className="flex items-start justify-between gap-4 py-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Default role for new users</p>
                  <p className="text-muted-foreground text-xs">
                    The role assigned when someone registers.
                  </p>
                </div>
                <Select
                  value={form.defaultRole}
                  onValueChange={(v) =>
                    v && set("defaultRole", v as Settings["defaultRole"])
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STUDENT">Student</SelectItem>
                    <SelectItem value="INSTRUCTOR">Instructor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <ToggleRow
                label="Maintenance mode"
                description="Show a maintenance notice and block non-admin access to the platform."
                checked={form.maintenanceMode}
                onChange={(v) => set("maintenanceMode", v)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Certificates ────────────────────────────────────────────────── */}
        <TabsContent value="certificates" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Who signs the certificates</CardTitle>
              <CardDescription>
                The same two signatories appear on all four designs, so they are
                set once here rather than retyped on every award.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Left signatory" htmlFor="cert-left-name">
                <Input
                  id="cert-left-name"
                  value={form.certLeftName}
                  onChange={(e) => set("certLeftName", e.target.value)}
                />
              </Field>
              <Field label="Their role" htmlFor="cert-left-title">
                <Input
                  id="cert-left-title"
                  value={form.certLeftTitle}
                  onChange={(e) => set("certLeftTitle", e.target.value)}
                />
              </Field>
              <Field
                label="Signature image"
                hint="A scan or PNG of the real signature, ideally on a transparent background. Leave it out and the name is written in a hand instead."
              >
                <ImageUpload
                  value={form.certLeftSignatureUrl}
                  onChange={(url) => set("certLeftSignatureUrl", url)}
                  label="signature"
                  previewClassName="h-12 w-28"
                />
              </Field>
              <Field label="Right signatory" htmlFor="cert-right-name">
                <Input
                  id="cert-right-name"
                  value={form.certRightName}
                  onChange={(e) => set("certRightName", e.target.value)}
                />
              </Field>
              <Field label="Their role" htmlFor="cert-right-title">
                <Input
                  id="cert-right-title"
                  value={form.certRightTitle}
                  onChange={(e) => set("certRightTitle", e.target.value)}
                />
              </Field>
              <Field label="Signature image" hint="Same again for the second signatory.">
                <ImageUpload
                  value={form.certRightSignatureUrl}
                  onChange={(url) => set("certRightSignatureUrl", url)}
                  label="signature"
                  previewClassName="h-12 w-28"
                />
              </Field>
              <p className="text-muted-foreground text-xs sm:col-span-2">
                These sign every certificate the academy issues — the learners&apos;
                real ones and the sample on the homepage alike. The logo comes
                from Branding, above.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Notifications ───────────────────────────────────────────────── */}
        <TabsContent value="notifications" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Email &amp; notifications</CardTitle>
              <CardDescription>
                The sender identity for system emails and which events notify admins.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="From name"
                  htmlFor="emailFromName"
                  hint="Display name on outgoing emails."
                >
                  <Input
                    id="emailFromName"
                    value={form.emailFromName}
                    onChange={(e) => set("emailFromName", e.target.value)}
                  />
                </Field>
                <Field
                  label="From address"
                  htmlFor="emailFromAddress"
                  hint="Leave blank to use the configured SMTP account."
                >
                  <Input
                    id="emailFromAddress"
                    type="email"
                    value={form.emailFromAddress}
                    onChange={(e) => set("emailFromAddress", e.target.value)}
                    placeholder="no-reply@example.com"
                  />
                </Field>
              </div>
              <Separator />
              <div className="divide-y">
                <ToggleRow
                  label="New enrollment"
                  description="Notify admins when a learner enrolls in a course."
                  checked={form.notifyOnEnrollment}
                  onChange={(v) => set("notifyOnEnrollment", v)}
                />
                <ToggleRow
                  label="Payment received"
                  description="Notify admins when a payment is completed."
                  checked={form.notifyOnPayment}
                  onChange={(v) => set("notifyOnPayment", v)}
                />
                <ToggleRow
                  label="New user signup"
                  description="Notify admins whenever a new account is created."
                  checked={form.notifyOnNewUser}
                  onChange={(v) => set("notifyOnNewUser", v)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Social ──────────────────────────────────────────────────────── */}
        <TabsContent value="social" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Social links</CardTitle>
              <CardDescription>
                Linked from the marketing footer. Leave blank to hide.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SocialField
                icon={<Globe className="size-4" />}
                label="Website"
                value={form.socialWebsite}
                onChange={(v) => set("socialWebsite", v)}
                placeholder="https://skillforcareer.com"
              />
              <SocialField
                icon={<AtSign className="size-4" />}
                label="LinkedIn"
                value={form.socialLinkedin}
                onChange={(v) => set("socialLinkedin", v)}
                placeholder="https://linkedin.com/company/…"
              />
              <SocialField
                icon={<Hash className="size-4" />}
                label="X / Twitter"
                value={form.socialTwitter}
                onChange={(v) => set("socialTwitter", v)}
                placeholder="https://x.com/…"
              />
              <SocialField
                icon={<Camera className="size-4" />}
                label="Instagram"
                value={form.socialInstagram}
                onChange={(v) => set("socialInstagram", v)}
                placeholder="https://instagram.com/…"
              />
              <SocialField
                icon={<Video className="size-4" />}
                label="YouTube"
                value={form.socialYoutube}
                onChange={(v) => set("socialYoutube", v)}
                placeholder="https://youtube.com/@…"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-muted-foreground text-center text-xs">
        {data.updatedAt
          ? `Last updated ${formatDistanceToNow(new Date(data.updatedAt), { addSuffix: true })}`
          : "No changes saved yet — showing platform defaults."}
      </p>
    </div>
  );
}

function SocialField({
  icon,
  label,
  value,
  onChange,
  placeholder,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground grid size-9 shrink-0 place-items-center rounded-lg border border-input bg-muted/40">
          {icon}
        </span>
        <Input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}
