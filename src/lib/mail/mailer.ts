import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "../logger";

/**
 * SMTP mailer (Gmail app password in dev; any SMTP provider in prod).
 *
 * The transporter is created lazily and cached so we open one connection pool
 * per server process. `sendMail` never throws to the caller — a failed OTP
 * email should surface as a friendly "try again", not crash the request — but
 * it is logged and returns a boolean so callers can react.
 */
let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true", // false → STARTTLS on 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    pool: true,
    maxConnections: 3,
  });

  return transporter;
}

function fromAddress(): string {
  const name = process.env.SMTP_FROM_NAME ?? "SkillForCareer";
  const email =
    process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER ?? "no-reply@localhost";
  return `"${name}" <${email}>`;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendMail(input: SendMailInput): Promise<boolean> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    logger.warn("SMTP credentials missing — email not sent", {
      to: input.to,
      subject: input.subject,
    });
    return false;
  }

  try {
    const info = await getTransporter().sendMail({
      from: fromAddress(),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    logger.info("Email sent", { to: input.to, messageId: info.messageId });
    return true;
  } catch (error) {
    logger.error("Failed to send email", {
      to: input.to,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/** Verifies the SMTP connection/credentials. Used by the health check. */
export async function verifyMailer(): Promise<boolean> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) return false;
  try {
    await getTransporter().verify();
    return true;
  } catch (error) {
    logger.error("SMTP verification failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
