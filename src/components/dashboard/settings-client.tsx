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
  Stethoscope,
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
import { Textarea } from "@/components/ui/textarea";
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

const CODING_PRACTICE_AUDIENCES: {
  value: Settings["codingPracticeAudience"];
  label: string;
}[] = [
  { value: "enrolled", label: "Enrolled learners and staff" },
  { value: "everyone", label: "Everyone signed in" },
  { value: "staff", label: "Staff only" },
];

/** What the server environment holds for Coding Practice — never the secret itself. */
export interface CodingPracticeServerConfig {
  /** CODING_PRACTICE_URL, used when the address field is left blank. */
  url: string;
  /** Whether CODING_PRACTICE_SSO_SECRET is set. */
  secretSet: boolean;
}

export function SettingsClient({
  data,
  codingPracticeServer = { url: "", secretSet: false },
}: {
  data: SettingsWithMeta;
  codingPracticeServer?: CodingPracticeServerConfig;
}) {
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
          <TabsTrigger value="learning" className={TAB_TRIGGER}>
            Learning
          </TabsTrigger>
          <TabsTrigger value="fees" className={TAB_TRIGGER}>
            Fees &amp; EMI
          </TabsTrigger>
          <TabsTrigger value="assistant" className={TAB_TRIGGER}>
            Assistant
          </TabsTrigger>
          <TabsTrigger value="coding-practice" className={TAB_TRIGGER}>
            <Stethoscope /> Coding Practice
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

        {/* ── Learning limits ─────────────────────────────────────────────── */}
        <TabsContent value="learning" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Watch &amp; attempt limits</CardTitle>
              <CardDescription>
                Platform-wide caps. A lesson, quiz or assignment can override its
                own — set one of these to 0 for no limit, which is how the
                platform behaved before limits existed.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Lesson views per learner"
                htmlFor="lessonViewLimit"
                hint="How many times a learner may open the same lecture. 0 = unlimited."
              >
                <Input
                  id="lessonViewLimit"
                  type="number"
                  min={0}
                  value={form.lessonViewLimit}
                  onChange={(e) => set("lessonViewLimit", Number(e.target.value) || 0)}
                />
              </Field>
              <Field
                label="Material downloads per learner"
                htmlFor="lessonDownloadLimit"
                hint="Applies to a lesson's notes, PDFs and attachments. 0 = unlimited."
              >
                <Input
                  id="lessonDownloadLimit"
                  type="number"
                  min={0}
                  value={form.lessonDownloadLimit}
                  onChange={(e) => set("lessonDownloadLimit", Number(e.target.value) || 0)}
                />
              </Field>
              <Field
                label="Quiz attempts"
                htmlFor="quizAttemptLimit"
                hint="Used when a quiz doesn't set its own. 0 = unlimited."
              >
                <Input
                  id="quizAttemptLimit"
                  type="number"
                  min={0}
                  value={form.quizAttemptLimit}
                  onChange={(e) => set("quizAttemptLimit", Number(e.target.value) || 0)}
                />
              </Field>
              <Field
                label="Assignment submissions"
                htmlFor="assignmentAttemptLimit"
                hint="How many times a learner may submit the same assignment. 0 = unlimited."
              >
                <Input
                  id="assignmentAttemptLimit"
                  type="number"
                  min={0}
                  value={form.assignmentAttemptLimit}
                  onChange={(e) =>
                    set("assignmentAttemptLimit", Number(e.target.value) || 0)
                  }
                />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Fees & EMI ──────────────────────────────────────────────────── */}
        <TabsContent value="fees" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Instalment plans</CardTitle>
              <CardDescription>
                What the office may offer when it sets a learner up on EMI.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="divide-y">
                <ToggleRow
                  label="Offer EMI"
                  description="Let staff split a fee into monthly instalments."
                  checked={form.emiEnabled}
                  onChange={(v) => set("emiEnabled", v)}
                />
                <ToggleRow
                  label="Allow zero-cost EMI"
                  description="A plan with nothing added on top of the course price."
                  checked={form.emiZeroCostEnabled}
                  onChange={(v) => set("emiZeroCostEnabled", v)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Interest rate (%)"
                  htmlFor="emiInterestPercent"
                  hint="Applied to an interest-based plan when the counsellor doesn't override it."
                >
                  <Input
                    id="emiInterestPercent"
                    type="number"
                    min={0}
                    max={60}
                    step="0.5"
                    value={form.emiInterestPercent}
                    onChange={(e) =>
                      set("emiInterestPercent", Number(e.target.value) || 0)
                    }
                  />
                </Field>
                <Field
                  label="Longest plan (months)"
                  htmlFor="emiMaxInstallments"
                  hint="The most instalments a fee may be split into."
                >
                  <Input
                    id="emiMaxInstallments"
                    type="number"
                    min={2}
                    max={36}
                    value={form.emiMaxInstallments}
                    onChange={(e) =>
                      set("emiMaxInstallments", Number(e.target.value) || 2)
                    }
                  />
                </Field>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Assistant & guides ──────────────────────────────────────────── */}
        <TabsContent value="assistant" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Assistant &amp; guided tour</CardTitle>
              <CardDescription>
                The chat assistant on the website and the walkthrough that runs
                the first time someone opens a panel. Train the assistant&apos;s
                answers under Assistant in the sidebar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="divide-y">
                <ToggleRow
                  label="Show the chat assistant"
                  description="The floating chat button on the public site and inside the panels."
                  checked={form.chatbotEnabled}
                  onChange={(v) => set("chatbotEnabled", v)}
                />
                <ToggleRow
                  label="Run the panel tour"
                  description="A guided walkthrough on someone's first visit to their panel."
                  checked={form.tourEnabled}
                  onChange={(v) => set("tourEnabled", v)}
                />
                <ToggleRow
                  label="Offer the voice guide"
                  description="Lets the tour read itself aloud, using the browser's own speech."
                  checked={form.voiceGuideEnabled}
                  onChange={(v) => set("voiceGuideEnabled", v)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Assistant's name"
                  htmlFor="chatbotName"
                  hint="Shown on the chat button and in the window."
                >
                  <Input
                    id="chatbotName"
                    value={form.chatbotName}
                    onChange={(e) => set("chatbotName", e.target.value)}
                  />
                </Field>
              </div>
              <Field
                label="Opening message"
                htmlFor="chatbotGreeting"
                hint="The first thing a visitor sees when they open the chat."
              >
                <Textarea
                  id="chatbotGreeting"
                  rows={3}
                  value={form.chatbotGreeting}
                  onChange={(e) => set("chatbotGreeting", e.target.value)}
                />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Coding Practice ─────────────────────────────────────────────── */}
        <TabsContent value="coding-practice" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Coding Practice</CardTitle>
              <CardDescription>
                The medical-coding practice software. Its link in the panels
                opens it in a new tab already signed in, so nobody needs a
                second password.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="divide-y">
                <ToggleRow
                  label="Show Coding Practice"
                  description="Adds a Coding Practice link to the learner and admin panels for the people chosen below."
                  checked={form.codingPracticeEnabled}
                  onChange={(v) => set("codingPracticeEnabled", v)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Who can open it"
                  hint="Staff means super admins and admins."
                >
                  <Select
                    value={form.codingPracticeAudience}
                    onValueChange={(v) =>
                      v &&
                      set("codingPracticeAudience", v as Settings["codingPracticeAudience"])
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v: string) =>
                          CODING_PRACTICE_AUDIENCES.find((a) => a.value === v)?.label ?? v
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {CODING_PRACTICE_AUDIENCES.map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label="Address"
                  htmlFor="codingPracticeUrl"
                  hint={
                    codingPracticeServer.url
                      ? `Leave blank to use the server's address, ${codingPracticeServer.url}.`
                      : "Where Coding Practice runs, e.g. https://practice.skillforcareer.com."
                  }
                >
                  <Input
                    id="codingPracticeUrl"
                    type="url"
                    value={form.codingPracticeUrl}
                    onChange={(e) => set("codingPracticeUrl", e.target.value)}
                    placeholder={codingPracticeServer.url || "https://"}
                  />
                </Field>
              </div>
              <Separator />
              {codingPracticeServer.secretSet ? (
                <p className="text-muted-foreground text-xs">
                  The sign-in secret is set on the server. It stays there and is
                  never saved with these settings.
                </p>
              ) : (
                <p className="text-destructive text-xs">
                  The sign-in secret isn&apos;t set on the server yet
                  (CODING_PRACTICE_SSO_SECRET). Until it is, the link shows a
                  &ldquo;not connected yet&rdquo; page instead of signing anyone in.
                </p>
              )}
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
