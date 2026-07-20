"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { registerWebinarSchema } from "@/lib/validations/webinar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/shared/phone-input";

export function WebinarRegisterForm({ webinarId, isFull }: { webinarId: string; isFull: boolean }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ joinUrl: string | null } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = registerWebinarSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{ joinUrl: string | null }>(`/api/webinars/${webinarId}/register`, parsed.data);
      setDone({ joinUrl: res.joinUrl });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't register. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-50 p-5 text-center dark:bg-emerald-500/10">
        <CheckCircle2 className="mx-auto size-8 text-emerald-600 dark:text-emerald-400" />
        <p className="mt-2 font-semibold">You&apos;re registered!</p>
        <p className="text-muted-foreground mt-1 text-sm">We&apos;ll email you the joining details before it starts.</p>
        {done.joinUrl && (
          <Button className="mt-4" nativeButton={false} render={<a href={done.joinUrl} target="_blank" rel="noopener" />}>
            <ExternalLink className="size-4" /> Join link
          </Button>
        )}
      </div>
    );
  }

  if (isFull) {
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed p-5 text-center text-sm">
        This webinar is full — registrations are closed.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h3 className="text-lg font-semibold">Reserve your seat</h3>
      <div className="space-y-1.5">
        <Label htmlFor="w-name">Full name</Label>
        <Input id="w-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Your name" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="w-email">Email</Label>
        <Input id="w-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="you@example.com" required />
      </div>
      <div className="space-y-1.5">
        <Label>Phone (optional)</Label>
        <PhoneInput value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting && <Loader2 className="size-4 animate-spin" />}
        Register free
      </Button>
    </form>
  );
}
