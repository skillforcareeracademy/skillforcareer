import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mail/mailer";
import { sendSms, smsConfigured } from "@/lib/sms";
import { AppError } from "@/lib/api/errors";
import { env } from "@/lib/env";
import { OPEN_LEAD_STAGES } from "@/lib/validations/lead";
import type {
  LeadReminderChannel,
  LeadReminderInput,
  LeadStage,
} from "@/lib/validations/lead";

/**
 * Lead reminders — the counsellor's nudge before a scheduled centre visit, by
 * email and/or SMS. Two entry points, mirroring payment-reminder-service:
 * `remindLead` (an admin clicks "Send reminder") and `runLeadReminders`
 * (a nightly sweep over tomorrow's visits).
 *
 * Neither throws on a delivery failure — a dead SMTP box or an unconfigured SMS
 * gateway comes back as `{ email: false }` so the UI can say what actually went
 * out, rather than failing the whole request.
 */

const APP_URL = env.NEXT_PUBLIC_APP_URL;
const DAY = 86_400_000;

interface LeadForReminder {
  id: string;
  leadNo: string | null;
  name: string;
  email: string | null;
  phone: string;
  stage: LeadStage;
  visitDate: Date | null;
  visitTime: string | null;
  expectedVisit: string | null;
  followUpDate: Date | null;
  followUpTime: string | null;
  course: { title: string } | null;
  courseInterest: string | null;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "on Sat, 29 Aug at 16:30" / "for This Saturday" / "" — whatever we know. */
function visitLabel(lead: LeadForReminder): string {
  if (lead.visitDate) {
    return `on ${fmtDate(lead.visitDate)}${lead.visitTime ? ` at ${lead.visitTime}` : ""}`;
  }
  return lead.expectedVisit ? `for ${lead.expectedVisit}` : "";
}

function courseLabel(lead: LeadForReminder): string | null {
  return lead.course?.title ?? lead.courseInterest ?? null;
}

/** "on 1 Sep at 11:00" — the scheduled call-back, if one is set. */
function callBackLabel(lead: LeadForReminder): string {
  if (!lead.followUpDate) return "";
  return `on ${fmtDate(lead.followUpDate)}${lead.followUpTime ? ` at ${lead.followUpTime}` : ""}`;
}

function reminderText(lead: LeadForReminder, custom?: string): string {
  if (custom?.trim()) return custom.trim();
  const course = courseLabel(lead);
  const about = course ? ` about the ${course} programme` : "";
  const visit = visitLabel(lead);
  if (visit) {
    return `Hi ${lead.name}, this is a reminder about your visit to SkillForCareer ${visit}${about}. Reply or call us if you need to reschedule.`;
  }
  const callBack = callBackLabel(lead);
  if (callBack) {
    return `Hi ${lead.name}, our counsellor will call you ${callBack}${about}. Reply if another time suits you better.`;
  }
  return `Hi ${lead.name}, this is a follow-up from SkillForCareer${about}. Our counsellor will call you shortly — reply if you'd like a specific time.`;
}

function reminderEmail(
  lead: LeadForReminder,
  body: string,
): { subject: string; html: string; text: string } {
  const course = courseLabel(lead);
  const visit = visitLabel(lead);
  const callBack = callBackLabel(lead);
  const subject = visit
    ? `Your visit to SkillForCareer ${visit}`
    : callBack
      ? `We'll call you ${callBack}`
      : "Following up on your enquiry";

  const details = [
    course ? `<li><strong>Course:</strong> ${course}</li>` : "",
    lead.visitDate
      ? `<li><strong>Visit date:</strong> ${fmtDate(lead.visitDate)}</li>`
      : "",
    lead.visitTime ? `<li><strong>Time:</strong> ${lead.visitTime}</li>` : "",
    lead.followUpDate
      ? `<li><strong>Call-back:</strong> ${fmtDate(lead.followUpDate)}${lead.followUpTime ? ` at ${lead.followUpTime}` : ""}</li>`
      : "",
    lead.leadNo ? `<li><strong>Reference:</strong> ${lead.leadNo}</li>` : "",
  ]
    .filter(Boolean)
    .join("");

  const html = `
  <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#111">
    <h2 style="color:#e11d48">SkillForCareer</h2>
    <p>${body.replace(/\n/g, "<br>")}</p>
    ${details ? `<ul style="color:#444;font-size:14px;line-height:1.7">${details}</ul>` : ""}
    <p style="margin:20px 0">
      <a href="${APP_URL}/courses"
         style="background:#e11d48;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">
        Browse our courses
      </a>
    </p>
    <p style="color:#666;font-size:13px">— Admissions team, SkillForCareer</p>
  </div>`;

  return { subject, html, text: body };
}

export interface ReminderDelivery {
  email: boolean;
  sms: boolean;
  /** Why a channel didn't go out, in plain words the admin UI can show. */
  notes: string[];
}

async function deliver(
  lead: LeadForReminder,
  channels: readonly LeadReminderChannel[],
  custom?: string,
): Promise<ReminderDelivery> {
  const body = reminderText(lead, custom);
  const result: ReminderDelivery = { email: false, sms: false, notes: [] };

  if (channels.includes("EMAIL")) {
    if (!lead.email) result.notes.push("No email address on this lead.");
    else {
      result.email = await sendMail({
        to: lead.email,
        ...reminderEmail(lead, body),
      });
      if (!result.email)
        result.notes.push("Email couldn't be sent — check the SMTP settings.");
    }
  }

  if (channels.includes("SMS")) {
    if (!smsConfigured())
      result.notes.push("SMS gateway isn't configured yet (set SMS_API_URL).");
    else {
      result.sms = await sendSms({ to: lead.phone, text: body });
      if (!result.sms)
        result.notes.push("SMS couldn't be sent — the gateway rejected it.");
    }
  }

  if (result.email || result.sms) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { lastRemindedAt: new Date() },
    });
  }
  return result;
}

const LEAD_SELECT = {
  id: true,
  leadNo: true,
  name: true,
  email: true,
  phone: true,
  stage: true,
  visitDate: true,
  visitTime: true,
  expectedVisit: true,
  followUpDate: true,
  followUpTime: true,
  courseInterest: true,
  course: { select: { title: true } },
} as const;

/**
 * Admin-initiated reminder. The send is also written to the follow-up timeline,
 * so "did anyone actually contact them?" has an answer six weeks later.
 */
export async function remindLead(
  leadId: string,
  input: LeadReminderInput,
  userId: string,
): Promise<ReminderDelivery> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: LEAD_SELECT,
  });
  if (!lead) throw AppError.notFound("Lead not found.");

  const result = await deliver(
    lead as LeadForReminder,
    input.channels,
    input.message,
  );

  const sentOn = [result.email && "email", result.sms && "SMS"]
    .filter(Boolean)
    .join(" + ");
  if (sentOn) {
    await prisma.leadFollowUp.create({
      data: {
        leadId,
        note: `Reminder sent by ${sentOn}.${input.message?.trim() ? `\n"${input.message.trim()}"` : ""}`,
        createdById: userId,
      },
    });
  } else if (result.notes.length) {
    throw AppError.badRequest(result.notes.join(" "));
  }

  return result;
}

export interface LeadReminderRunResult {
  leadsReminded: number;
  emailsSent: number;
  smsSent: number;
}

/**
 * Nightly sweep: anyone with a centre visit *or* a scheduled call-back in the
 * next 24 hours who is still live in the funnel and hasn't been nudged in the
 * last 20 hours. That throttle is what stops a re-run — or a cron that fires
 * twice — from messaging the same person again.
 */
export async function runLeadReminders(): Promise<LeadReminderRunResult> {
  const now = new Date();
  const horizon = new Date(now.getTime() + DAY);
  const throttle = new Date(now.getTime() - 20 * 3_600_000);

  const due = await prisma.lead.findMany({
    where: {
      stage: { in: [...OPEN_LEAD_STAGES] },
      AND: [
        {
          OR: [
            { visitDate: { gte: now, lte: horizon } },
            { followUpDate: { gte: now, lte: horizon } },
          ],
        },
        {
          OR: [{ lastRemindedAt: null }, { lastRemindedAt: { lt: throttle } }],
        },
      ],
    },
    orderBy: { visitDate: "asc" },
    take: 200,
    select: LEAD_SELECT,
  });

  const result: LeadReminderRunResult = {
    leadsReminded: 0,
    emailsSent: 0,
    smsSent: 0,
  };
  for (const lead of due) {
    const sent = await deliver(lead as LeadForReminder, ["EMAIL", "SMS"]);
    if (sent.email) result.emailsSent += 1;
    if (sent.sms) result.smsSent += 1;
    if (sent.email || sent.sms) result.leadsReminded += 1;
  }
  return result;
}
