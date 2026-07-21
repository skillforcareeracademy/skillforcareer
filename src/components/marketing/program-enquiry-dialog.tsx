"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, MessageSquareText, Send } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { enquirySchema } from "@/lib/validations/lead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PhoneInput } from "@/components/shared/phone-input";

/**
 * "Enquiry" on a program card: asks for a callback without making the visitor
 * sign up first. It writes to the same lead pipeline as the homepage form
 * (Admin → Leads), with the programme pre-filled as the course of interest.
 */
export function ProgramEnquiryDialog({ courseTitle }: { courseTitle: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    // Reset a moment later so the form doesn't visibly wipe during the close
    // animation of a successful submit.
    if (!next) {
      setTimeout(() => {
        setDone(false);
        setForm({ name: "", phone: "", email: "", message: "" });
      }, 200);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = enquirySchema.safeParse({ ...form, courseInterest: courseTitle });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/api/enquiries", parsed.data);
      setDone(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't send. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="flex-1">
            <MessageSquareText className="size-4" /> Enquiry
          </Button>
        }
      />

      <DialogContent className="sm:max-w-md">
        {done ? (
          <div className="flex flex-col items-center py-6 text-center">
            <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
              <CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400" />
            </span>
            <DialogTitle className="text-base">Enquiry received</DialogTitle>
            <DialogDescription className="mt-1.5 max-w-xs">
              Our counsellor will call you about {courseTitle} shortly.
            </DialogDescription>
            <Button variant="outline" size="sm" className="mt-5" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Enquire about this program</DialogTitle>
              <DialogDescription>
                Leave your number and we&apos;ll call you back about{" "}
                <span className="text-foreground font-medium">{courseTitle}</span> — fees,
                batches and placement support. No sign-up needed.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={onSubmit} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="pe-name" className="text-xs">
                  Full name
                </Label>
                <Input
                  id="pe-name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Your name"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Phone number</Label>
                <PhoneInput value={form.phone} onChange={(v) => set("phone", v)} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="pe-email" className="text-xs">
                  Email{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="pe-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="you@example.com"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="pe-msg" className="text-xs">
                  Message{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Textarea
                  id="pe-msg"
                  value={form.message}
                  onChange={(e) => set("message", e.target.value)}
                  placeholder="When can you start? Any questions?"
                  rows={3}
                />
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Sending…
                  </>
                ) : (
                  <>
                    <Send className="size-4" /> Request a callback
                  </>
                )}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
