"use client";

import { useState, type FormEvent } from "react";
import { Building2, CheckCircle2, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { enquirySchema } from "@/lib/validations/lead";
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
import { PhoneInput } from "@/components/shared/phone-input";

const TEAM_SIZES = ["1 – 10", "11 – 50", "51 – 200", "200+"];

const blank = {
  name: "",
  company: "",
  email: "",
  phone: "",
  teamSize: TEAM_SIZES[1],
  courseInterest: "",
  message: "",
};

/**
 * Corporate training enquiry. It writes to the same lead pipeline as the
 * homepage callback form — the B2B-only answers (company, team size) are folded
 * into the message so the sales team sees them without a second lead schema.
 */
export function BusinessEnquiryForm() {
  const [form, setForm] = useState(blank);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.company.trim()) {
      toast.error("Enter your company name");
      return;
    }

    const details = [
      `Company: ${form.company.trim()}`,
      `Team size: ${form.teamSize}`,
      form.message.trim(),
    ]
      .filter(Boolean)
      .join("\n");

    const parsed = enquirySchema.safeParse({
      name: form.name,
      email: form.email,
      phone: form.phone,
      courseInterest: form.courseInterest,
      message: details,
    });
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
    <div className="bg-card w-full overflow-hidden rounded-2xl border shadow-sm">
      <div className="bg-muted/40 flex items-center gap-2.5 border-b px-5 py-3">
        <span className="bg-primary/10 text-primary grid size-8 shrink-0 place-items-center rounded-lg">
          <Building2 className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm leading-tight font-semibold">Request a proposal</h3>
          <p className="text-muted-foreground text-xs">We reply within one working day</p>
        </div>
      </div>

      {done ? (
        <div className="flex flex-col items-center px-5 py-10 text-center">
          <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
            <CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400" />
          </span>
          <h4 className="text-base font-semibold">Proposal request received</h4>
          <p className="text-muted-foreground mt-1.5 max-w-xs text-sm">
            Our corporate team will get in touch to understand your goals and share a
            costed plan.
          </p>
          <Button variant="outline" size="sm" className="mt-5" onClick={() => setDone(false)}>
            Send another request
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="biz-name" className="text-xs">
                Your name
              </Label>
              <Input
                id="biz-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Full name"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="biz-company" className="text-xs">
                Company
              </Label>
              <Input
                id="biz-company"
                value={form.company}
                onChange={(e) => set("company", e.target.value)}
                placeholder="Company name"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="biz-email" className="text-xs">
              Work email
            </Label>
            <Input
              id="biz-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="you@company.com"
              required
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Phone number</Label>
            <PhoneInput value={form.phone} onChange={(v) => set("phone", v)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Team size</Label>
              <Select
                value={form.teamSize}
                onValueChange={(v) => set("teamSize", (v as string) ?? TEAM_SIZES[1])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{(v) => (v as string) ?? TEAM_SIZES[1]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TEAM_SIZES.map((size) => (
                    <SelectItem key={size} value={size}>
                      {size} people
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="biz-area" className="text-xs">
                Training area{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="biz-area"
                value={form.courseInterest}
                onChange={(e) => set("courseInterest", e.target.value)}
                placeholder="e.g. Data Science"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="biz-msg" className="text-xs">
              What do you want the team to learn?{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="biz-msg"
              value={form.message}
              onChange={(e) => set("message", e.target.value)}
              placeholder="Goals, timelines, budget — anything that helps us prepare."
              rows={3}
            />
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Sending…
              </>
            ) : (
              <>
                <Send className="size-4" /> Request a proposal
              </>
            )}
          </Button>
          <p className="text-muted-foreground text-center text-xs">
            No spam. Your details are used only to prepare your proposal.
          </p>
        </form>
      )}
    </div>
  );
}
