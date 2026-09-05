"use client";

import { cloneElement, useState, type FormEvent, type ReactElement } from "react";
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

/** Pinned onto whatever element opens the dialog — see the comment at the
 *  trigger for why this can't be left to prop merging. */
const TRIGGER_SLOT = { "data-slot": "dialog-trigger" } as const;

/**
 * The site's one enquiry popup: asks for a callback without making the visitor
 * sign up first, and writes to the same lead pipeline as the homepage form
 * (Admin → Leads).
 *
 * One component, three callers — the header button, the programme cards, and
 * "Enquiry Now" on a course page — because the client asked for the course page
 * to open "wahi form popup jo header me hai". Only the trigger differs, so it's
 * the only thing a caller passes in.
 */
export function EnquiryDialog({
  courseTitle,
  trigger,
  title = "Talk to a counsellor",
}: {
  /** Pre-fills the programme of interest on the lead, when there is one. */
  courseTitle?: string;
  /** The button that opens it. Defaults to a plain outline "Enquiry" button. */
  trigger?: ReactElement;
  title?: string;
}) {
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
    const parsed = enquirySchema.safeParse({
      ...form,
      ...(courseTitle ? { courseInterest: courseTitle } : {}),
    });
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

  const subject = courseTitle ?? "our programs";
  const triggerElement =
    trigger ?? (
      <Button variant="outline" size="sm" className="flex-1">
        <MessageSquareText className="size-4" /> Enquiry
      </Button>
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The trigger element carries `data-slot` itself.
          `DialogTrigger` renders `data-slot="dialog-trigger"` and `Button`
          renders `data-slot="button"`; when a Button is handed to `render`,
          which of the two wins differs between the server pass and hydration,
          and React reports the difference as a mismatch on every page the
          dialog appears on. Setting it on the element that is actually rendered
          means both passes read the same value from the same place. */}
      <DialogTrigger render={cloneElement(triggerElement, TRIGGER_SLOT)} />

      <DialogContent className="sm:max-w-md">
        {done ? (
          <div className="flex flex-col items-center py-6 text-center">
            <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
              <CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400" />
            </span>
            <DialogTitle className="text-base">Enquiry received</DialogTitle>
            <DialogDescription className="mt-1.5 max-w-xs">
              Our counsellor will call you about {subject} shortly.
            </DialogDescription>
            <Button
              variant="outline"
              size="sm"
              className="mt-5"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{courseTitle ? "Enquire about this program" : title}</DialogTitle>
              <DialogDescription>
                Leave your number and we&apos;ll call you back about{" "}
                <span className="text-foreground font-medium">{subject}</span> — fees,
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
