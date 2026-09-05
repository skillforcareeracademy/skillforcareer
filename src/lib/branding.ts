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

/**
 * The brand name as a wordmark — "Skill For Career", not "SkillForCareer".
 *
 * The dashboards print the name beside the logo, and the client asked for it
 * "space dekar". Splitting on the camel-case boundaries keeps one setting doing
 * both jobs: the compact form stays right for email subjects and page titles,
 * and a name an admin has already typed with spaces is passed straight through.
 */
export function brandWordmark(siteName: string): string {
  if (/\s/.test(siteName.trim())) return siteName.trim();
  return siteName.replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
}
