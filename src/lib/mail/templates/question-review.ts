import { emailLayout } from "./layout";

/**
 * The three emails a "this question looks wrong" raises: a receipt for the
 * learner, a heads-up for the admins and the instructor, and the answer going
 * back to the learner.
 *
 * Everything interpolated here was typed by somebody, so it is escaped.
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

function p(text: string): string {
  return `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#3f3f46;">${text}</p>`;
}

function refBox(ref: string): string {
  return `<p style="margin:16px 0;padding:12px 16px;background:#f4f4f5;border-radius:10px;font-size:14px;color:#18181b;">
    Reference <strong>${esc(ref)}</strong>
  </p>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0 0;">
    <a href="${esc(href)}" style="display:inline-block;background:#e11d48;color:#ffffff;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">${esc(label)}</a>
  </p>`;
}

export function reviewRaisedForStudent(d: {
  name: string;
  ref: string;
  questionNo: number;
  quizTitle: string;
  body: string;
}) {
  return {
    subject: `Review request ${d.ref} received`,
    html: emailLayout({
      heading: "We've got your review request",
      previewText: `Question ${d.questionNo} of ${d.quizTitle}`,
      bodyHtml: [
        p(`Hi ${esc(d.name)},`),
        p(esc(d.body)),
        refBox(d.ref),
        button(`${APP_URL}/student/quizzes`, "Back to your quizzes"),
      ].join(""),
    }),
  };
}

export function reviewRaisedForTeam(d: {
  name: string;
  ref: string;
  questionNo: number;
  quizTitle: string;
  studentName: string;
  questionText: string;
  note: string | null;
}) {
  return {
    subject: `Question review ${d.ref} — ${d.quizTitle}`,
    html: emailLayout({
      heading: "A learner has flagged a question",
      previewText: `${d.studentName} · question ${d.questionNo}`,
      bodyHtml: [
        p(`Hi ${esc(d.name)},`),
        p(
          `${esc(d.studentName)} thinks there is a mistake in question ${d.questionNo} of ` +
            `<strong>${esc(d.quizTitle)}</strong>.`,
        ),
        p(`<em>${esc(d.questionText)}</em>`),
        d.note ? p(`They wrote: ${esc(d.note)}`) : "",
        refBox(d.ref),
        p("Answer it from the panel and the learner is told either way."),
        button(`${APP_URL}/admin/quiz-reviews`, "Review the request"),
      ].join(""),
    }),
  };
}

export function reviewAnsweredForStudent(d: {
  name: string;
  ref: string;
  questionNo: number;
  quizTitle: string;
  reply: string;
  rectified: boolean;
}) {
  return {
    subject: `Review request ${d.ref} — ${d.rectified ? "corrected" : "reviewed"}`,
    html: emailLayout({
      heading: d.rectified ? "Thank you — it has been rectified" : "We've reviewed your request",
      previewText: `Question ${d.questionNo} of ${d.quizTitle}`,
      bodyHtml: [
        p(`Hi ${esc(d.name)},`),
        p(
          `About question ${d.questionNo} of <strong>${esc(d.quizTitle)}</strong>, which you ` +
            `raised as ${esc(d.ref)}:`,
        ),
        p(esc(d.reply)),
        button(`${APP_URL}/student/quizzes`, "Back to your quizzes"),
      ].join(""),
    }),
  };
}
