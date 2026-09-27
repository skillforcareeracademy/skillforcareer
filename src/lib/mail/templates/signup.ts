import { emailLayout, DEFAULT_MAIL_BRAND, type MailBrand } from "./layout";

/**
 * The two emails a new learner gets: the code that finishes their sign-up, and
 * the welcome that tells them what to do with the account.
 *
 * Everything interpolated is escaped — names and email addresses are typed by
 * the public.
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

function button(href: string, label: string): string {
  return `<p style="margin:24px 0 8px;">
    <a href="${esc(href)}" style="display:inline-block;background:#e11d48;color:#ffffff;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:600;text-decoration:none;">${esc(label)}</a>
  </p>`;
}

/** A numbered "what happens next" list, which is what a first email is for. */
function steps(items: string[]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 16px;">
    ${items
      .map(
        (item, i) => `<tr>
          <td style="padding:5px 10px 5px 0;vertical-align:top;">
            <span style="display:inline-block;width:22px;height:22px;border-radius:11px;background:#fff1f2;color:#e11d48;font-size:12px;font-weight:700;text-align:center;line-height:22px;">${i + 1}</span>
          </td>
          <td style="padding:5px 0;font-size:14px;line-height:1.6;color:#3f3f46;">${item}</td>
        </tr>`,
      )
      .join("")}
  </table>`;
}

function codeBox(code: string, expiryMinutes: number): string {
  return `<div style="margin:0 0 8px;padding:20px;background:#fff1f2;border:1px solid #fecdd3;border-radius:14px;text-align:center;">
      <span style="font-size:32px;font-weight:700;letter-spacing:10px;color:#9f1239;font-family:'SF Mono',ui-monospace,Menlo,monospace;">${esc(code)}</span>
      <p style="margin:8px 0 0;font-size:12px;color:#9f1239;">Valid for ${expiryMinutes} minutes</p>
    </div>`;
}

/** Step one of signing up: prove the inbox is yours. */
export function verifyEmailMail(d: {
  name?: string;
  code: string;
  expiryMinutes: number;
  brand?: MailBrand;
}): { subject: string; html: string; text: string } {
  const brand = d.brand ?? DEFAULT_MAIL_BRAND;
  const greeting = d.name ? `Hi ${esc(d.name)},` : "Hi,";
  return {
    subject: `${d.code} — confirm your email to finish signing up`,
    html: emailLayout({
      brand,
      heading: "Confirm your email",
      previewText: `${d.code} finishes your ${brand.siteName} sign-up`,
      bodyHtml: [
        p(`${greeting} welcome to <strong>${esc(brand.siteName)}</strong>.`),
        p("Enter this code on the verification screen to finish creating your account:"),
        codeBox(d.code, d.expiryMinutes),
        p("Once it's confirmed you can sign in, enrol on a course and join your live classes."),
        p(
          "Didn't try to sign up? You can ignore this email — the code only works on this address, and the account stays closed without it.",
          true,
        ),
      ].join(""),
    }),
    text:
      `${d.name ? `Hi ${d.name},` : "Hi,"} your ${brand.siteName} verification code is ${d.code}. ` +
      `It is valid for ${d.expiryMinutes} minutes. If you didn't try to sign up, ignore this email.`,
  };
}

/** Step two: the account exists — here is what to do with it. */
export function welcomeMail(d: {
  name: string;
  email: string;
  /** Set when an admin made the account, so the person knows how they got it. */
  roleLabel?: string | null;
  /** Set when the account was made by an admin and has no password yet. */
  createdByAcademy?: boolean;
  referralCode?: string | null;
  referralReward?: number;
  brand?: MailBrand;
}): { subject: string; html: string; text: string } {
  const brand = d.brand ?? DEFAULT_MAIL_BRAND;
  const first = esc(d.name.split(" ")[0] || d.name);
  const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  const next = d.createdByAcademy
    ? [
        `Sign in with <strong>${esc(d.email)}</strong> and the password your academy gave you — or pick <strong>Email code</strong> on the sign-in page and we'll send a one-time code instead.`,
        "Open <strong>My Learning</strong> to find your course, its lessons and its notes.",
        "Your live classes appear under <strong>Live Classes</strong>, with the link 24 hours before each one.",
        "Quizzes, assignments and your certificate all live in the same panel.",
      ]
    : [
        `Sign in any time with <strong>${esc(d.email)}</strong>.`,
        "Pick your course and enrol — you can pay in full or in instalments.",
        "Join your live classes from <strong>Live Classes</strong>; the link opens 24 hours before each class.",
        "Track your quizzes, assignments and certificates as you go.",
      ];

  return {
    subject: `Welcome to ${brand.siteName}, ${first}`,
    html: emailLayout({
      brand,
      heading: `Welcome, ${first} — your account is ready`,
      previewText: `Signing in with ${d.email}`,
      bodyHtml: [
        d.roleLabel
          ? p(
              `An account has been created for you on <strong>${esc(brand.siteName)}</strong> as <strong>${esc(d.roleLabel)}</strong>.`,
            )
          : p(
              `Your email is confirmed and your <strong>${esc(brand.siteName)}</strong> account is live.`,
            ),
        p("<strong>What to do next</strong>"),
        steps(next),
        button(`${brand.appUrl}/login`, "Sign in to your panel"),
        p(
          "The Skill For Career app for Android and iPhone signs in with the same email — your courses, classes and notes come with you.",
          true,
        ),
        d.referralCode
          ? p(
              `Refer a friend with your code <strong>${esc(d.referralCode)}</strong> and ` +
                `${rupees(d.referralReward ?? 5000)} goes into your wallet when they enrol.`,
              true,
            )
          : "",
      ].join(""),
    }),
    text:
      `Welcome to ${brand.siteName}, ${d.name}. Your account is ready — sign in at ${brand.appUrl}/login with ${d.email}. ` +
      (d.createdByAcademy
        ? "Use the password your academy gave you, or choose \"Email code\" for a one-time code. "
        : "") +
      (d.referralCode
        ? `Your referral code is ${d.referralCode} — ${rupees(d.referralReward ?? 5000)} for every friend who enrols.`
        : ""),
  };
}
