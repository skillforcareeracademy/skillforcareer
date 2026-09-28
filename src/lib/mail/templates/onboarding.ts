import { emailLayout, DEFAULT_MAIL_BRAND, type MailBrand } from "./layout";

/**
 * "Fill in your details" — the form admissions needs once a learner is in.
 *
 * Sent after sign-up and again when a fee is recorded, because that is when the
 * academy actually needs the address, the ID and the CV. Everything
 * interpolated is escaped: names come from the public.
 */

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function p(html: string, muted = false): string {
  return `<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:${muted ? "#71717a" : "#3f3f46"};">${html}</p>`;
}

function bullets(items: string[]): string {
  return `<ul style="margin:4px 0 16px;padding-left:20px;font-size:14px;line-height:1.7;color:#3f3f46;">
    ${items.map((item) => `<li style="margin:0 0 4px;">${item}</li>`).join("")}
  </ul>`;
}

export function onboardingFormMail(d: {
  name: string;
  /** Why they're getting this now — after signing up, or after paying. */
  reason?: "signup" | "payment";
  brand?: MailBrand;
}): { subject: string; html: string; text: string } {
  const brand = d.brand ?? DEFAULT_MAIL_BRAND;
  const first = esc(d.name.split(" ")[0] || d.name);
  const href = `${brand.appUrl}/student/profile/details`;
  const opening =
    d.reason === "payment"
      ? "Your fee is recorded — thank you. One short form is left before the academy can finish your admission file."
      : "Your account is ready. One short form is left before the academy can finish your admission file.";

  return {
    subject: `${first}, complete your student profile`,
    html: emailLayout({
      brand,
      heading: "Complete your student profile",
      previewText: "Address, ID and CV — about five minutes",
      bodyHtml: [
        p(`Hi ${first},`),
        p(opening),
        p("<strong>What it asks for</strong>"),
        bullets([
          "Your address and a WhatsApp number we can reach you on",
          "Aadhaar and one photo ID — a photo of each is fine",
          "Your highest qualification, college and year of passing",
          "Your CV, and what kind of role you're looking for",
        ]),
        `<p style="margin:24px 0 8px;">
          <a href="${esc(href)}" style="display:inline-block;background:#e11d48;color:#ffffff;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:600;text-decoration:none;">Fill in my details</a>
        </p>`,
        p(
          "You can save it half-finished and come back. Once you submit it, your documents and schooling are locked — write to the office if anything needs correcting after that.",
          true,
        ),
        p(`Or open it any time from your panel: Profile → My details.`, true),
      ].join(""),
    }),
    text:
      `Hi ${first}, ${opening} Fill in your student profile here: ${href} — address, WhatsApp, Aadhaar and one photo ID, ` +
      `your qualification and your CV. You can save it half-finished and come back.`,
  };
}
