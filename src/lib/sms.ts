import { logger } from "./logger";

/**
 * SMS sending, behind one vendor-neutral HTTP shim.
 *
 * India requires an SMS route through a DLT-registered gateway, so — like the
 * payment gateway — an external service is unavoidable. What we *can* avoid is
 * lock-in: any provider that accepts a plain HTTP request (MSG91, Fast2SMS,
 * Textlocal, Gupshup, a telco's own API…) is configured entirely from env, and
 * swapping providers never touches application code.
 *
 *   SMS_API_URL       endpoint; also the on/off switch — unset means "no SMS"
 *   SMS_API_METHOD    POST (default) or GET
 *   SMS_API_KEY       sent as `Authorization: Bearer …` unless the template
 *                     uses {key}, in which case it is interpolated instead
 *   SMS_API_BODY      JSON body template for POST, e.g.
 *                     {"sender":"{sender}","route":"4","number":"{to}","message":"{text}"}
 *   SMS_SENDER_ID     6-char DLT sender id, e.g. SFCACD
 *   SMS_TEMPLATE_ID   DLT template id, when the provider needs one
 *
 * Placeholders in SMS_API_URL / SMS_API_BODY: {to} {text} {sender} {template} {key}
 *
 * Like `sendMail`, this never throws at the caller — a failed nudge must not
 * take down the request that triggered it. It logs and returns a boolean.
 */

export interface SendSmsInput {
  /** Destination number. Non-digits are stripped; a bare 10-digit Indian number gets +91. */
  to: string;
  text: string;
}

export function smsConfigured(): boolean {
  return Boolean(process.env.SMS_API_URL);
}

/** Digits only, with a country code — most Indian gateways want `919876543210`. */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0"))
    return `91${digits.slice(1)}`;
  return digits;
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(
    /\{(to|text|sender|template|key)\}/g,
    (_m, key: string) => values[key] ?? "",
  );
}

export async function sendSms(input: SendSmsInput): Promise<boolean> {
  const url = process.env.SMS_API_URL;
  if (!url) {
    logger.warn("SMS gateway not configured — message not sent", {
      to: input.to,
    });
    return false;
  }

  const values = {
    to: normalisePhone(input.to),
    text: input.text,
    sender: process.env.SMS_SENDER_ID ?? "",
    template: process.env.SMS_TEMPLATE_ID ?? "",
    key: process.env.SMS_API_KEY ?? "",
  };

  const method =
    (process.env.SMS_API_METHOD ?? "POST").toUpperCase() === "GET"
      ? "GET"
      : "POST";
  const bodyTemplate = process.env.SMS_API_BODY;

  // GET gateways carry everything in the query string, so those placeholders
  // have to be percent-encoded; a JSON body must not be.
  const endpoint = fill(url, {
    ...values,
    to: encodeURIComponent(values.to),
    text: encodeURIComponent(values.text),
    sender: encodeURIComponent(values.sender),
    template: encodeURIComponent(values.template),
    key: encodeURIComponent(values.key),
  });

  const headers: Record<string, string> = {};
  if (
    process.env.SMS_API_KEY &&
    !url.includes("{key}") &&
    !bodyTemplate?.includes("{key}")
  ) {
    headers.Authorization = `Bearer ${process.env.SMS_API_KEY}`;
  }

  let body: string | undefined;
  if (method === "POST") {
    body = bodyTemplate
      ? fill(bodyTemplate, {
          ...values,
          text: JSON.stringify(values.text).slice(1, -1),
        })
      : JSON.stringify({
          to: values.to,
          message: values.text,
          sender: values.sender,
        });
    headers["Content-Type"] = "application/json";
  }

  try {
    const res = await fetch(endpoint, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.warn("SMS gateway rejected the message", {
        to: values.to,
        status: res.status,
        response: (await res.text().catch(() => "")).slice(0, 300),
      });
      return false;
    }
    logger.info("sms.sent", { to: values.to });
    return true;
  } catch (err) {
    logger.error("SMS send failed", {
      to: values.to,
      error: (err as Error).message,
    });
    return false;
  }
}
