import { emailLayout, type MailBrand } from "./layout";

/**
 * An announcement the academy sent from the panel. The staff member typed every
 * word of it, so the body is escaped and then given back its line breaks —
 * never interpolated as HTML.
 */

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Typed text into paragraphs: blank lines split, single breaks stay breaks. */
function body(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => esc(para.trim()).replace(/\n/g, "<br />"))
    .filter(Boolean)
    .map(
      (html) =>
        `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#3f3f46;">${html}</p>`,
    )
    .join("");
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0 0;">
    <a href="${esc(href)}" style="display:inline-block;background:#e11d48;color:#ffffff;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">${esc(label)}</a>
  </p>`;
}

export function broadcastEmail(d: {
  name: string;
  title: string;
  message: string;
  actionUrl?: string | null;
  /** A notice or timetable sent with the message, as a link to download. */
  fileUrl?: string | null;
  fileName?: string | null;
  brand: MailBrand;
}) {
  const greeting = d.name.trim()
    ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#3f3f46;">Hi ${esc(d.name.trim().split(" ")[0])},</p>`
    : "";

  const link = d.actionUrl?.trim()
    ? button(
        /^https?:\/\//i.test(d.actionUrl.trim())
          ? d.actionUrl.trim()
          : `${d.brand.appUrl}${d.actionUrl.trim()}`,
        "Open",
      )
    : "";

  // A link rather than a real attachment: the file is already on the academy's
  // storage, and mail servers turn away anything large.
  const fileHref = d.fileUrl?.trim()
    ? /^https?:\/\//i.test(d.fileUrl.trim())
      ? d.fileUrl.trim()
      : `${d.brand.appUrl}${d.fileUrl.trim()}`
    : "";
  const attachment = fileHref
    ? button(fileHref, `Download ${esc(d.fileName?.trim() || "the attachment")}`)
    : "";

  return {
    subject: d.title,
    html: emailLayout({
      heading: d.title,
      previewText: d.message.slice(0, 120),
      brand: d.brand,
      bodyHtml: `${greeting}${body(d.message)}${link}${attachment}`,
    }),
    // Plain text for clients that won't render HTML.
    text: `${d.title}\n\n${d.message}${fileHref ? `\n\n${d.fileName ?? "Attachment"}: ${fileHref}` : ""}`,
  };
}
