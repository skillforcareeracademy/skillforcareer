import { headers } from "next/headers";

/**
 * Whether the request is coming from inside our own Android/iOS app.
 *
 * The native shell (a WebView) sets `applicationNameForUserAgent:
 * "SkillForCareerApp"`, so the token rides along in every request's User-Agent.
 * We read it server-side to drop the bits of the site that only make sense in a
 * browser — the "install the app" button, the app-promo band — so opening the
 * app feels like an app, not a web page nagging you to download itself.
 */
export async function isMobileApp(): Promise<boolean> {
  const ua = (await headers()).get("user-agent") ?? "";
  return ua.includes("SkillForCareerApp");
}
