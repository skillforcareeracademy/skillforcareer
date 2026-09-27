import { getSettings } from "./settings-service";
import { DEFAULT_MAIL_BRAND, type MailBrand } from "@/lib/mail/templates/layout";
import { env } from "@/lib/env";

/**
 * The academy's letterhead for an email: its name, its logo, and where a
 * reader writes back — all from Admin → Settings.
 *
 * A logo uploaded to the platform is stored as a relative path (`/api/files/…`),
 * which an inbox can't load, so it is made absolute here. Anything that fails
 * falls back to the bundled defaults: an email must never be held up by a
 * settings read.
 */
export async function mailBrand(): Promise<MailBrand> {
  const appUrl = env.NEXT_PUBLIC_APP_URL || DEFAULT_MAIL_BRAND.appUrl;
  try {
    const { settings } = await getSettings();
    const logo = settings.logoUrl?.trim();
    return {
      siteName: settings.siteName || DEFAULT_MAIL_BRAND.siteName,
      logoUrl: logo ? (/^https?:\/\//i.test(logo) ? logo : `${appUrl}${logo}`) : null,
      supportEmail: settings.supportEmail || null,
      supportPhone: settings.contactPhone || null,
      appUrl,
    };
  } catch {
    return { ...DEFAULT_MAIL_BRAND, appUrl };
  }
}
