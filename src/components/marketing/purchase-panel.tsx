"use client";

import { MessageSquareText, PlayCircle, ShieldCheck, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/shared/button-link";
import { EnquiryDialog } from "./enquiry-dialog";

/**
 * The buy box on a course page.
 *
 * Two buttons, and neither goes near a login screen. "Enroll Now" opens the
 * express checkout, which collects the buyer's details and takes the payment on
 * one page — the client's "enroll now button should not be going on sign in or
 * signup page, it should directly take to payment". "Enquiry Now" opens the
 * same callback popup the header uses, for the visitor who wants to talk to
 * somebody before paying.
 *
 * The money itself lives on `/checkout/[slug]` now (coupon, Razorpay, the lot),
 * so there is nothing left to do here but route.
 */
export function PurchasePanel({
  slug,
  courseTitle,
  isEnrolled,
  isFree,
}: {
  slug: string;
  courseTitle: string;
  isEnrolled: boolean;
  isFree: boolean;
}) {
  if (isEnrolled) {
    return (
      <ButtonLink href={`/student/learn/${slug}`} size="lg" className="w-full">
        <PlayCircle className="size-4" /> Go to course
      </ButtonLink>
    );
  }

  return (
    <div className="space-y-2.5">
      <ButtonLink href={`/checkout/${slug}`} size="lg" className="w-full">
        <ShoppingCart className="size-4" />
        {isFree ? "Enroll for free" : "Enroll Now"}
      </ButtonLink>

      <EnquiryDialog
        courseTitle={courseTitle}
        trigger={
          <Button variant="outline" size="lg" className="w-full">
            <MessageSquareText className="size-4" /> Enquiry Now
          </Button>
        }
      />

      {!isFree && (
        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
          <ShieldCheck className="size-3.5" /> Secure payment via Razorpay
        </p>
      )}
    </div>
  );
}
