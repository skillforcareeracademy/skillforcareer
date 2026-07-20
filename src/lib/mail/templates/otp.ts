import { emailLayout } from "./layout";

export type OtpPurpose = "verify-email" | "reset-password" | "login";

const HEADINGS: Record<OtpPurpose, string> = {
  "verify-email": "Verify your email",
  "reset-password": "Reset your password",
  login: "Your login code",
};

export function otpEmail(input: {
  code: string;
  purpose: OtpPurpose;
  expiryMinutes: number;
  name?: string;
}): { subject: string; html: string; text: string } {
  const { code, purpose, expiryMinutes, name } = input;
  const heading = HEADINGS[purpose];
  const greeting = name ? `Hi ${name},` : "Hi,";

  const bodyHtml = `
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#3f3f46;">
      ${greeting} use the code below to ${
        purpose === "reset-password"
          ? "reset your password"
          : "continue signing in"
      }. It expires in ${expiryMinutes} minutes.
    </p>
    <div style="margin:0 0 20px;padding:18px;background:#f4f4f5;border-radius:12px;text-align:center;">
      <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#18181b;font-family:'SF Mono',ui-monospace,Menlo,monospace;">${code}</span>
    </div>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;">
      If you didn't request this, you can safely ignore this email.
    </p>`;

  return {
    subject: `${code} is your ${
      process.env.NEXT_PUBLIC_APP_NAME ?? "SkillForCareer"
    } code`,
    html: emailLayout({ heading, bodyHtml, previewText: `${code} — expires in ${expiryMinutes} min` }),
    text: `${greeting}\n\nYour code is ${code}. It expires in ${expiryMinutes} minutes.\n\nIf you didn't request this, ignore this email.`,
  };
}
