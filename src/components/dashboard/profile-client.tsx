"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck, Mail, ShieldCheck, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { api, ApiError } from "@/lib/api-client";
import {
  changePasswordSchema,
  type ChangePasswordInput,
} from "@/lib/validations/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { PageHeader } from "@/components/shared/page-header";
import { PasswordInput } from "@/components/auth/password-input";
import { AvatarUpload } from "@/components/shared/avatar-upload";
import { PhoneInput } from "@/components/shared/phone-input";
import type { Profile } from "@/server/services/profile-service";

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

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

interface ProfileFormValues {
  name: string;
  headline: string;
  bio: string;
}

export function ProfileClient({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [timezone, setTimezone] = useState(profile.timezone || "Asia/Kolkata");
  const [locale, setLocale] = useState(profile.locale || "en");
  const [savingProfile, setSavingProfile] = useState(false);

  const initials = profile.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const profileForm = useForm<ProfileFormValues>({
    defaultValues: {
      name: profile.name,
      headline: profile.headline ?? "",
      bio: profile.bio ?? "",
    },
  });

  async function onSaveProfile(v: ProfileFormValues) {
    setSavingProfile(true);
    try {
      await api.patch("/api/profile", {
        name: v.name,
        phone,
        headline: v.headline,
        bio: v.bio,
        avatarUrl,
        timezone,
        locale,
      });
      toast.success("Profile updated.");
      router.refresh(); // header avatar/name reflect the change
    } catch (e) {
      if (e instanceof ApiError) {
        const d = e.details as { issues?: { message: string }[] } | undefined;
        toast.error(d?.issues?.[0]?.message ?? e.message);
      } else toast.error("Save failed.");
    } finally {
      setSavingProfile(false);
    }
  }

  const passwordForm = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
  });

  async function onChangePassword(v: ChangePasswordInput) {
    try {
      await api.post("/api/profile/password", v);
      toast.success("Password changed.");
      passwordForm.reset({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't change password.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile"
        description="Manage your account details, avatar and password."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle>Personal details</CardTitle>
              <CardDescription>This information appears across the platform.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={profileForm.handleSubmit(onSaveProfile)} className="space-y-4">
                <AvatarUpload
                  value={avatarUrl}
                  onChange={setAvatarUrl}
                  fallback={initials}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" htmlFor="name" error={profileForm.formState.errors.name?.message}>
                    <Input id="name" {...profileForm.register("name", { required: "Name is required" })} />
                  </Field>
                  <Field label="Phone" htmlFor="phone">
                    <PhoneInput id="phone" value={phone} onChange={setPhone} />
                  </Field>
                </div>

                <Field label="Headline" htmlFor="headline">
                  <Input id="headline" {...profileForm.register("headline")} placeholder="e.g. Data Scientist at …" />
                </Field>
                <Field label="Bio" htmlFor="bio">
                  <Textarea id="bio" rows={3} {...profileForm.register("bio")} placeholder="A short introduction" />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Timezone">
                    <Select value={timezone} onValueChange={(v) => v && setTimezone(v)}>
                      <SelectTrigger>
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
                  <Field label="Language">
                    <Select value={locale} onValueChange={(v) => v && setLocale(v)}>
                      <SelectTrigger>
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

                <Button type="submit" disabled={savingProfile}>
                  {savingProfile && <Loader2 className="size-4 animate-spin" />}
                  Save changes
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Password */}
          <Card>
            <CardHeader>
              <CardTitle>Change password</CardTitle>
              <CardDescription>Use a strong password you don&apos;t reuse elsewhere.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={passwordForm.handleSubmit(onChangePassword)} className="space-y-4">
                <Field label="Current password" htmlFor="currentPassword" error={passwordForm.formState.errors.currentPassword?.message}>
                  <PasswordInput id="currentPassword" autoComplete="current-password" {...passwordForm.register("currentPassword")} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="New password" htmlFor="newPassword" error={passwordForm.formState.errors.newPassword?.message}>
                    <PasswordInput id="newPassword" autoComplete="new-password" {...passwordForm.register("newPassword")} />
                  </Field>
                  <Field label="Confirm password" htmlFor="confirmPassword" error={passwordForm.formState.errors.confirmPassword?.message}>
                    <PasswordInput id="confirmPassword" autoComplete="new-password" {...passwordForm.register("confirmPassword")} />
                  </Field>
                </div>
                <Button type="submit" variant="outline" disabled={passwordForm.formState.isSubmitting}>
                  {passwordForm.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}
                  Update password
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Summary */}
        <div>
          <Card className="sticky top-24 items-center text-center">
            <CardContent className="flex flex-col items-center gap-3 pt-2">
              <Avatar className="size-20">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={profile.name} />}
                <AvatarFallback className="bg-gradient-to-br from-rose-500 to-pink-600 text-2xl font-semibold text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{profile.name}</p>
                <Badge variant="secondary" className="mt-1">{profile.roleLabel}</Badge>
              </div>
              <div className="text-muted-foreground w-full space-y-2 border-t pt-4 text-left text-sm">
                <p className="flex items-center gap-2">
                  {profile.emailVerified ? (
                    <MailCheck className="text-emerald-500 size-4 shrink-0" />
                  ) : (
                    <Mail className="size-4 shrink-0" />
                  )}
                  <span className="truncate">{profile.email}</span>
                </p>
                <p className="flex items-center gap-2">
                  <ShieldCheck className="size-4 shrink-0" />
                  {profile.status.charAt(0) + profile.status.slice(1).toLowerCase()}
                </p>
                <p className="flex items-center gap-2">
                  <CalendarDays className="size-4 shrink-0" />
                  Joined {formatDistanceToNow(new Date(profile.createdAt), { addSuffix: true })}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
