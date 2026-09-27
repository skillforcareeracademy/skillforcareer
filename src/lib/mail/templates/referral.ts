import { emailLayout } from "./layout";

/**
 * The birthday greeting with its gift voucher, and the note that says a
 * referral has paid out.
 */

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.skillforcareer.com";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function p(html: string): string {
  return `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#3f3f46;">${html}</p>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0 0;">
    <a href="${esc(href)}" style="display:inline-block;background:#e11d48;color:#ffffff;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">${esc(label)}</a>
  </p>`;
}

/** The voucher itself — a dashed card with the learner's code in it. */
function voucher(code: string, reward: number): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr>
      <td style="border:2px dashed #e11d48;border-radius:14px;padding:20px;text-align:center;background:#fff1f2;">
        <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#9f1239;">Your birthday gift</p>
        <p style="margin:0 0 10px;font-size:15px;color:#3f3f46;">Share this code with a friend</p>
        <p style="margin:0;font-size:26px;font-weight:700;letter-spacing:0.12em;color:#e11d48;">${esc(code)}</p>
        <p style="margin:10px 0 0;font-size:13px;color:#52525b;">
          When they enroll with it, <strong>${rupees(reward)}</strong> goes into your wallet.
        </p>
      </td>
    </tr>
  </table>`;
}

export function birthdayGreeting(d: {
  name: string;
  /** Left out when refer-and-earn is switched off — the wishes still go. */
  code?: string | null;
  reward?: number;
  siteName: string;
}) {
  const first = d.name.split(" ")[0] || d.name;
  return {
    subject: `Happy birthday, ${first}!`,
    html: emailLayout({
      heading: `Happy birthday, ${esc(first)}!`,
      previewText: `A gift from ${d.siteName} — your referral voucher inside`,
      bodyHtml: [
        p(
          `Everyone at ${esc(d.siteName)} wishes you a wonderful year ahead — may this one take ` +
            `you closer to the career you are working towards.`,
        ),
        ...(d.code
          ? [
              p("Here is a little something from us:"),
              voucher(d.code, d.reward ?? 0),
              p(
                `The money can be withdrawn from your wallet whenever you like, or kept towards ` +
                  `your next course.`,
              ),
              button(`${APP_URL}/student/wallet`, "Open your wallet"),
            ]
          : [button(`${APP_URL}/student`, "Carry on learning")]),
      ].join(""),
    }),
  };
}

export function referralRewardEmail(d: {
  name: string;
  refereeName: string;
  amount: number;
  balance: number;
}) {
  return {
    subject: `${rupees(d.amount)} added to your wallet`,
    html: emailLayout({
      heading: "Your referral just paid off",
      previewText: `${d.refereeName} enrolled with your code`,
      bodyHtml: [
        p(`Hi ${esc(d.name)},`),
        p(
          `${esc(d.refereeName)} has enrolled using your referral code, so ` +
            `<strong>${rupees(d.amount)}</strong> has been added to your wallet.`,
        ),
        p(`Your balance is now <strong>${rupees(d.balance)}</strong>.`),
        button(`${APP_URL}/student/wallet`, "Open your wallet"),
      ].join(""),
    }),
  };
}
