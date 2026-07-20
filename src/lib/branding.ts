import { DEFAULT_SETTINGS } from "@/lib/validations/settings";

/**
 * The brand assets shown in the chrome (header, footer, auth pages, favicon).
 *
 * Client-safe on purpose: `<Logo />` and the branding context both need the
 * type and the fallback, so this module must stay free of any server-only
 * import. The database read lives in `server/services/branding-service`.
 */
export interface Branding {
  logoUrl: string;
  faviconUrl: string;
  siteName: string;
}

export const DEFAULT_BRANDING: Branding = {
  logoUrl: DEFAULT_SETTINGS.logoUrl,
  faviconUrl: DEFAULT_SETTINGS.faviconUrl,
  siteName: DEFAULT_SETTINGS.siteName,
};
