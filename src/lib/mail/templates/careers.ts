import { emailLayout } from "./layout";

/**
 * The two emails a "Send your CV" submission triggers: a receipt for the
 * applicant, and a heads-up for the academy's inbox with everything they sent.
 *
 * Every value here was typed by a member of the public, so it is escaped before
 * it goes anywhere near the HTML.
 */

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "SkillForCareer";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** One label/value table row; blank values are left out entirely. */
function rows(pairs: [string, string | null | undefined][]): string {
  return pairs
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:6px 12px 6px 0;font-size:13px;color:#71717a;vertical-align:top;white-space:nowrap;">${esc(label)}</td>
          <td style="padding:6px 0;font-size:13px;color:#18181b;vertical-align:top;">${esc(String(value)).replace(/\n/g, "<br>")}</td>
        </tr>`,
    )
    .join("");
}

function button(href: string, label: string): string {
  return `
    <p style="margin:24px 0 0;">
      <a href="${esc(href)}" style="display:inline-block;background:#e11d48;color:#ffffff;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">${esc(label)}</a>
    </p>`;
}

export interface ApplicationMailData {
  name: string;
  email: string;
  phone: string;
  course: string | null;
  batchCode: string | null;
  jobExpecting: string | null;
  experience: string;
  experienceDetails: string | null;
  currentAddress: string | null;
  expectedLocation: string | null;
  expectedMode: string | null;
  joiningAvailability: string | null;
  appliedFor: string | null;
}

/** Sent to the applicant — proof it arrived, and what happens next. */
export function applicationReceivedEmail(data: ApplicationMailData): {
  subject: string;
  html: string;
  text: string;
} {
  const first = data.name.split(" ")[0] || data.name;
  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#3f3f46;">
      Hi ${esc(first)}, thanks for sending us your CV. It has reached our placement
      team, and we'll get in touch when a role matches what you're looking for.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
      ${rows([
        ["Applied for", data.appliedFor],
        ["Role you want", data.jobExpecting],
        ["Course", data.course],
        ["Batch", data.batchCode],
        ["Experience", data.experience],
        ["Preferred location", data.expectedLocation],
        ["Job mode", data.expectedMode],
        ["Can join", data.joiningAvailability],
      ])}
    </table>
    <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#71717a;">
      Something changed — a new CV, a different city? Reply to this email and we'll update your profile.
    </p>`;

  return {
    subject: `We've received your CV — ${APP_NAME}`,
    html: emailLayout({
      heading: "Your CV is with us",
      bodyHtml,
      previewText: "Our placement team has your CV.",
    }),
    text: [
      `Hi ${first},`,
      "Thanks for sending us your CV. It has reached our placement team, and we'll get in touch when a role matches what you're looking for.",
      [
        data.jobExpecting ? `Role you want: ${data.jobExpecting}` : "",
        data.course ? `Course: ${data.course}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      "Something changed? Reply to this email and we'll update your profile.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

/** Sent to the academy's inbox — the whole submission, with links to act on it. */
export function newApplicationAdminEmail(
  data: ApplicationMailData & { cvUrl: string | null; adminUrl: string },
): { subject: string; html: string; text: string } {
  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#3f3f46;">
      A new CV came in through the careers page.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0">
      ${rows([
        ["Name", data.name],
        ["Email", data.email],
        ["Phone", data.phone],
        ["Applied for", data.appliedFor],
        ["Role wanted", data.jobExpecting],
        ["Course", data.course],
        ["Batch", data.batchCode],
        ["Experience", data.experience],
        ["Details", data.experienceDetails],
        ["Address", data.currentAddress],
        ["Location", data.expectedLocation],
        ["Job mode", data.expectedMode],
        ["Can join", data.joiningAvailability],
      ])}
    </table>
    ${data.cvUrl ? `<p style="margin:16px 0 0;font-size:13px;"><a href="${esc(data.cvUrl)}" style="color:#e11d48;">Download the CV</a></p>` : ""}
    ${button(data.adminUrl, "Open in Admin → Careers")}`;

  return {
    subject: `New CV: ${data.name}${data.jobExpecting ? ` — ${data.jobExpecting}` : ""}`,
    html: emailLayout({
      heading: "New CV received",
      bodyHtml,
      previewText: `${data.name} sent a CV.`,
    }),
    text: [
      "A new CV came in through the careers page.",
      "",
      `Name: ${data.name}`,
      `Email: ${data.email}`,
      `Phone: ${data.phone}`,
      data.jobExpecting ? `Role wanted: ${data.jobExpecting}` : "",
      data.course ? `Course: ${data.course}` : "",
      data.batchCode ? `Batch: ${data.batchCode}` : "",
      `Experience: ${data.experience}`,
      data.cvUrl ? `CV: ${data.cvUrl}` : "",
      "",
      `Open it: ${data.adminUrl}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
