"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Send, PhoneCall, Mail, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { enquirySchema } from "@/lib/validations/lead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/shared/phone-input";
import { siteConfig } from "@/config/site";

const { contact } = siteConfig;
const blank = { name: "", phone: "", email: "", courseInterest: "", message: "" };

export function EnquiryForm() {
  const [form, setForm] = useState(blank);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = enquirySchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/api/enquiries", parsed.data);
      setDone(true);
      setForm(blank);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't send. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="enquiry" className="bg-muted/30 border-y py-16 sm:py-20">
      <div className="container-page grid items-center gap-10 lg:grid-cols-2">
        {/* Left: pitch */}
        <div className="max-w-lg">
          <span className="text-primary inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-sm font-medium">
            <Sparkles className="size-4" /> Free career counselling
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl">Talk to a course advisor</h2>
          <p className="text-muted-foreground mt-3 text-lg">
            Not sure which program fits you? Share your details and our team will call you back with a
            personalised learning plan — no pressure, just guidance.
          </p>
          <ul className="mt-6 space-y-3">
            {[
              "1:1 guidance on the right course & batch",
              "Fees, EMI options and scholarships explained",
              "Career outcomes and placement support",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-sm">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" /> {t}
              </li>
            ))}
          </ul>
          <div className="text-muted-foreground mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <a href={`tel:${contact.phone}`} className="hover:text-foreground flex items-center gap-2 transition-colors">
              <PhoneCall className="size-4" /> {contact.phoneDisplay}
            </a>
            <a href={`mailto:${contact.email}`} className="hover:text-foreground flex items-center gap-2 transition-colors">
              <Mail className="size-4" /> {contact.email}
            </a>
          </div>
        </div>

        {/* Right: form */}
        <div className="bg-card rounded-2xl border p-6 shadow-sm sm:p-8">
          {done ? (
            <div className="flex flex-col items-center py-10 text-center">
              <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
                <CheckCircle2 className="size-7 text-emerald-600 dark:text-emerald-400" />
              </span>
              <h3 className="text-xl font-semibold">Request received!</h3>
              <p className="text-muted-foreground mt-2 max-w-xs text-sm">
                Thanks for reaching out. Our team will call you back shortly.
              </p>
              <Button variant="outline" className="mt-6" onClick={() => setDone(false)}>
                Send another enquiry
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <h3 className="text-lg font-semibold">Request a callback</h3>
              <div className="space-y-1.5">
                <Label htmlFor="en-name">Full name</Label>
                <Input
                  id="en-name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Your name"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone number</Label>
                <PhoneInput value={form.phone} onChange={(v) => set("phone", v)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="en-email">Email (optional)</Label>
                <Input
                  id="en-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="en-course">Course of interest (optional)</Label>
                <Input
                  id="en-course"
                  value={form.courseInterest}
                  onChange={(e) => set("courseInterest", e.target.value)}
                  placeholder="e.g. Data Science, Full-Stack…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="en-msg">Message (optional)</Label>
                <Textarea
                  id="en-msg"
                  rows={3}
                  value={form.message}
                  onChange={(e) => set("message", e.target.value)}
                  placeholder="Tell us your goals…"
                />
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Request callback
              </Button>
              <p className="text-muted-foreground text-center text-xs">
                By submitting, you agree to be contacted about our programs.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
