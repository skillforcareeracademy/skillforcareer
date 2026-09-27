/**
 * Shared responsive HTML email shell. Inline styles only — email clients strip
 * <style> and external CSS. Keeps every transactional email on-brand.
 *
 * The brand can be passed in (the academy's own name, logo, and where to write
 * for help, all of which live in Admin → Settings). Callers that don't have it
 * to hand fall back to the environment, so an email is never blocked on a
 * database read.
 */
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "SkillForCareer";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.skillforcareer.com";

export interface MailBrand {
  siteName: string;
  /** Absolute URL only — a relative path can't load inside an inbox. */
  logoUrl?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  appUrl: string;
}

export const DEFAULT_MAIL_BRAND: MailBrand = {
  siteName: APP_NAME,
  logoUrl: null,
  supportEmail: null,
  supportPhone: null,
  appUrl: APP_URL,
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function emailLayout(options: {
  heading: string;
  bodyHtml: string;
  previewText?: string;
  brand?: MailBrand;
}): string {
  const { heading, bodyHtml, previewText } = options;
  const brand = options.brand ?? DEFAULT_MAIL_BRAND;
  const year = new Date().getFullYear();

  // The academy's own mark when it has one that an inbox can load, its name
  // otherwise. Brand colour rather than a generic gradient: this is the
  // academy's letterhead, and it should look like the site the reader knows.
  const masthead =
    brand.logoUrl && /^https?:\/\//i.test(brand.logoUrl)
      ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.siteName)}" height="34" style="height:34px;width:auto;display:block;border:0;" />`
      : `<span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.02em;">${esc(brand.siteName)}</span>`;

  const help: string[] = [];
  if (brand.supportEmail) {
    help.push(
      `<a href="mailto:${esc(brand.supportEmail)}" style="color:#71717a;text-decoration:none;">${esc(brand.supportEmail)}</a>`,
    );
  }
  if (brand.supportPhone) help.push(esc(brand.supportPhone));

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
  </head>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    ${
      previewText
        ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(previewText)}</div>`
        : ""
    }
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
            <tr>
              <td style="padding:24px 32px;background:${brand.logoUrl ? "#ffffff" : "linear-gradient(135deg,#e11d48,#be123c)"};${brand.logoUrl ? "border-bottom:1px solid #f4f4f5;" : ""}">
                ${masthead}
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#18181b;font-weight:600;">${esc(heading)}</h1>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #f4f4f5;">
                ${
                  help.length > 0
                    ? `<p style="margin:0 0 6px;font-size:12px;color:#71717a;">Need a hand? ${help.join(" · ")}</p>`
                    : ""
                }
                <p style="margin:0;font-size:12px;color:#a1a1aa;">
                  © ${year} ${esc(brand.siteName)} ·
                  <a href="${esc(brand.appUrl)}" style="color:#a1a1aa;">${esc(brand.appUrl.replace(/^https?:\/\//, ""))}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
