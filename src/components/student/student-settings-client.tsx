"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTheme } from "next-themes";
import { format } from "date-fns";
import {
  Loader2,
  Sun,
  Moon,
  Monitor,
  Globe,
  Bell,
  ShieldCheck,
  UserRound,
  MailCheck,
  Mail,
  CalendarDays,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/validations/profile";
import {
  NOTIFICATION_FIELDS,
  type NotificationPrefs,
} from "@/lib/validations/preferences";
import type { Profile } from "@/server/services/profile-service";
import { PageHeader } from "@/components/shared/page-header";
import { PasswordInput } from "@/components/auth/password-input";
import { ButtonLink } from "@/components/shared/button-link";
import { LogoutButton } from "@/components/dashboard/logout-button";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

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
const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];
const TAB_TRIGGER = "gap-1.5 px-3";

// SSR-safe "are we on the client yet" — false during SSR/first render, true after
// hydration — without a setState-in-effect. Used to defer client-only UI.
const noopSubscribe = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function StudentSettingsClient({
  profile,
  notifications,
  profileHref = "/student/profile",
}: {
  profile: Profile;
  notifications: NotificationPrefs;
  /** Where "Edit profile" links — role-specific (e.g. /instructor/profile). */
  profileHref?: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your account, preferences and notifications." />

      <Tabs defaultValue="appearance">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="appearance" className={TAB_TRIGGER}>
            <Sun className="size-4" /> Appearance
          </TabsTrigger>
          <TabsTrigger value="regional" className={TAB_TRIGGER}>
            <Globe className="size-4" /> Regional
          </TabsTrigger>
          <TabsTrigger value="notifications" className={TAB_TRIGGER}>
            <Bell className="size-4" /> Notifications
          </TabsTrigger>
          <TabsTrigger value="security" className={TAB_TRIGGER}>
            <ShieldCheck className="size-4" /> Security
          </TabsTrigger>
          <TabsTrigger value="account" className={TAB_TRIGGER}>
            <UserRound className="size-4" /> Account
          </TabsTrigger>
        </TabsList>

        <TabsContent value="appearance" className="mt-4">
          <AppearanceTab />
        </TabsContent>
        <TabsContent value="regional" className="mt-4">
          <RegionalTab profile={profile} />
        </TabsContent>
        <TabsContent value="notifications" className="mt-4">
          <NotificationsTab initial={notifications} />
        </TabsContent>
        <TabsContent value="security" className="mt-4">
          <SecurityTab />
        </TabsContent>
        <TabsContent value="account" className="mt-4">
          <AccountTab profile={profile} profileHref={profileHref} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  // The theme is only known on the client — gate the active highlight on mount
  // so server and first client render agree (avoids a hydration mismatch).
  const mounted = useMounted();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Choose how SkillForCareer looks on this device.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {THEMES.map((t) => {
            const active = mounted && theme === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setTheme(t.value)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border p-5 transition-colors",
                  active
                    ? "border-primary bg-primary/5 ring-primary/30 ring-1"
                    : "hover:border-primary/40 border-border",
                )}
              >
                <t.icon className={cn("size-6", active ? "text-primary" : "text-muted-foreground")} />
                <span className="text-sm font-medium">{t.label}</span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function RegionalTab({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [timezone, setTimezone] = useState(profile.timezone);
  const [locale, setLocale] = useState(profile.locale);
  const [saving, setSaving] = useState(false);
  const dirty = timezone !== profile.timezone || locale !== profile.locale;

  async function save() {
    setSaving(true);
    try {
      await api.patch("/api/profile", {
        name: profile.name,
        phone: profile.phone ?? "",
        headline: profile.headline ?? "",
        bio: profile.bio ?? "",
        avatarUrl: profile.avatarUrl ?? "",
        timezone,
        locale,
      });
      toast.success("Preferences saved.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Regional preferences</CardTitle>
        <CardDescription>Set your time zone and language for dates and content.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Time zone</Label>
            <Select value={timezone} onValueChange={(v) => setTimezone(v ?? profile.timezone)}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v) => v ?? "Select"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Language</Label>
            <Select value={locale} onValueChange={(v) => setLocale(v ?? profile.locale)}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v) => LOCALES.find((l) => l.value === v)?.label ?? "Select"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || !dirty}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NotificationsTab({ initial }: { initial: NotificationPrefs }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(initial);
  const [saving, setSaving] = useState(false);
  const dirty = NOTIFICATION_FIELDS.some((f) => prefs[f.key] !== initial[f.key]);

  async function save() {
    setSaving(true);
    try {
      await api.patch("/api/profile/preferences", prefs);
      toast.success("Notification preferences saved.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email notifications</CardTitle>
        <CardDescription>Choose what we email you about.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {NOTIFICATION_FIELDS.map((f) => (
            <div key={f.key} className="flex items-start justify-between gap-4 py-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{f.label}</p>
                <p className="text-muted-foreground text-xs">{f.description}</p>
              </div>
              <Switch
                checked={prefs[f.key]}
                onCheckedChange={(v) => setPrefs((p) => ({ ...p, [f.key]: v }))}
                className="mt-0.5"
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={saving || !dirty}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save preferences
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SecurityTab() {
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(v: ChangePasswordInput) {
    try {
      await api.post("/api/profile/password", v);
      toast.success("Password changed.");
      form.reset({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't change password.");
    }
  }

  const { errors, isSubmitting } = form.formState;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Use a strong password you don&apos;t use elsewhere.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-md space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">Current password</Label>
            <PasswordInput id="currentPassword" {...form.register("currentPassword")} />
            {errors.currentPassword && (
              <p className="text-destructive text-xs">{errors.currentPassword.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">New password</Label>
            <PasswordInput id="newPassword" {...form.register("newPassword")} />
            {errors.newPassword && (
              <p className="text-destructive text-xs">{errors.newPassword.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <PasswordInput id="confirmPassword" {...form.register("confirmPassword")} />
            {errors.confirmPassword && (
              <p className="text-destructive text-xs">{errors.confirmPassword.message}</p>
            )}
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Change password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function AccountTab({ profile, profileHref }: { profile: Profile; profileHref: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Your account details and session.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field icon={Mail} label="Email">
            <span className="flex items-center gap-2">
              {profile.email}
              {profile.emailVerified ? (
                <Badge variant="secondary" className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  <MailCheck className="size-3" /> Verified
                </Badge>
              ) : (
                <Badge variant="secondary">Unverified</Badge>
              )}
            </span>
          </Field>
          <Field icon={UserRound} label="Role">
            {profile.roleLabel}
          </Field>
          <Field icon={CalendarDays} label="Member since">
            {format(new Date(profile.createdAt), "d MMM yyyy")}
          </Field>
        </div>

        <Separator />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Edit your profile</p>
            <p className="text-muted-foreground text-xs">
              Update your name, photo, headline and bio.
            </p>
          </div>
          <ButtonLink href={profileHref} variant="outline" size="sm">
            Edit profile
          </ButtonLink>
        </div>

        <Separator />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Sign out</p>
            <p className="text-muted-foreground text-xs">Sign out of your account on this device.</p>
          </div>
          <LogoutButton />
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Mail;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Icon className="size-3.5" /> {label}
      </p>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}
