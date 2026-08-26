"use client";

import { MessageCircle, MessageSquareText, Phone } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  contactHref,
  contactNumber,
  type LeadContactChannel,
} from "@/lib/validations/lead";
import { cn } from "@/lib/utils";

const CHANNELS = [
  {
    channel: "CALL" as const,
    icon: Phone,
    label: "Call",
    tint: "hover:text-sky-600 dark:hover:text-sky-400",
  },
  {
    channel: "WHATSAPP" as const,
    icon: MessageCircle,
    label: "WhatsApp",
    tint: "hover:text-emerald-600 dark:hover:text-emerald-400",
  },
  {
    channel: "SMS" as const,
    icon: MessageSquareText,
    label: "SMS",
    tint: "hover:text-violet-600 dark:hover:text-violet-400",
  },
];

/**
 * Call / WhatsApp / SMS, one tap from the lead.
 *
 * The handoff happens *synchronously* in the click handler and the attempt is
 * logged after it. Two reasons: awaiting the round-trip first would put the
 * `window.open` outside the user gesture and the browser would block it, and a
 * counsellor working a queue should never wait on the CRM to reach a dialer.
 * The log is best-effort by design — it is a record of outreach, not a gate on
 * it — so a failure surfaces as a toast rather than stopping the call.
 */
export function LeadContactActions({
  lead,
  onLogged,
  size = "icon-sm",
  className,
}: {
  lead: { id: string; phone: string; whatsapp?: string | null };
  onLogged?: () => void;
  size?: "icon-sm" | "icon";
  className?: string;
}) {
  function reach(channel: LeadContactChannel) {
    const target = contactNumber(lead, channel);
    const href = contactHref(target, channel);

    // WhatsApp is a web URL and belongs in its own tab; tel: and sms: hand off
    // to the OS, which leaves the current tab where it is.
    if (channel === "WHATSAPP") window.open(href, "_blank", "noopener");
    else window.location.assign(href);

    api
      .post(`/api/leads/${lead.id}/contact`, { channel })
      .then(() => onLogged?.())
      .catch(() =>
        toast.error("Couldn't log this attempt — the lead's history may be incomplete."),
      );
  }

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {CHANNELS.map(({ channel, icon: Icon, label, tint }) => (
        <Tooltip key={channel}>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size={size}
                className={cn("text-muted-foreground", tint)}
                aria-label={`${label} ${lead.phone}`}
                onClick={(e) => {
                  // The row opens the detail sheet; reaching out shouldn't.
                  e.stopPropagation();
                  reach(channel);
                }}
              />
            }
          >
            <Icon className="size-4" />
          </TooltipTrigger>
          <TooltipContent>
            {label} {contactNumber(lead, channel)}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
