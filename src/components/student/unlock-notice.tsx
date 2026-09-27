"use client";

import Link from "next/link";
import { GraduationCap, Mail, MessageSquareText, Phone, Share2 } from "lucide-react";
import { EnquiryDialog } from "@/components/marketing/enquiry-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * What a learner who has signed up but not paid sees at the top of their panel.
 *
 * The academy wrote this one themselves — it tells the learner how to unlock
 * the courses, how to reach a counsellor if they would rather enrol offline,
 * and that their referral code is already earning whether they enrol or not.
 * The four buttons are the things they might want to do next.
 */
export function UnlockNotice({
  phone,
  email,
  referralEnabled,
}: {
  /** From Admin → Settings; the buttons drop out if they aren't set. */
  phone: string | null;
  email: string | null;
  referralEnabled: boolean;
}) {
  const telHref = phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="space-y-4 py-6">
        <div className="space-y-2">
          <h2 className="text-base font-semibold">To unlock your courses and other options</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Please enrol in any course by paying in the <strong>Courses</strong> tab in your
            dashboard, or from the website after logging in with the same email you registered
            with. If you have enrolled offline, are looking to enrol offline, or would like any
            counselling before enrolling, please feel free to contact Skill For Career
            {phone ? (
              <>
                {" "}
                at <span className="text-foreground font-medium">{phone}</span>
              </>
            ) : null}
            {email ? (
              <>
                {" "}
                or email us at{" "}
                <a href={`mailto:${email}`} className="text-primary font-medium hover:underline">
                  {email}
                </a>
              </>
            ) : null}{" "}
            to see batch details, lectures, notes or quizzes.
          </p>
          {referralEnabled && (
            <p className="text-muted-foreground text-sm leading-relaxed">
              Your referral code has already been created and is in your{" "}
              <Link href="/student/wallet" className="text-primary font-medium hover:underline">
                wallet
              </Link>
              . You do not need to enrol in any course to share it — every friend who enrols with
              your code earns you a referral amount.
            </p>
          )}
          <p className="text-muted-foreground text-sm">
            You can find all the links you need in the buttons below.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button nativeButton={false} render={<Link href="/courses" />}>
            <GraduationCap className="size-4" /> Enroll now
          </Button>
          {referralEnabled && (
            <Button variant="outline" nativeButton={false} render={<Link href="/student/wallet" />}>
              <Share2 className="size-4" /> Refer Now
            </Button>
          )}
          {telHref && (
            <Button variant="outline" nativeButton={false} render={<a href={telHref} />}>
              <Phone className="size-4" /> Call us
            </Button>
          )}
          <EnquiryDialog
            title="Talk to a counsellor"
            trigger={
              <Button variant="outline">
                <MessageSquareText className="size-4" /> Enquiry now
              </Button>
            }
          />
          {email && (
            <Button variant="ghost" nativeButton={false} render={<a href={`mailto:${email}`} />}>
              <Mail className="size-4" /> Email us
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
