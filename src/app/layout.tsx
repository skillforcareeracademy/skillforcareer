import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { AppProviders } from "@/components/providers";
import { getBranding } from "@/server/services/branding-service";
import { getTracking } from "@/server/services/tracking-service";
import { getSettings } from "@/server/services/settings-service";
import {
  SiteTracking,
  SiteTrackingNoScript,
} from "@/components/shared/site-tracking";
import { siteConfig } from "@/config/site";
import "./globals.css";

// `--font-sans` is what globals.css / Tailwind's font-sans resolves to.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const [{ faviconUrl }, { googleSiteVerification }, { settings }] =
    await Promise.all([getBranding(), getTracking(), getSettings()]);

  // The office's own SEO, set under Settings → "need to change keywords". Blank
  // fields fall back to the built-in defaults so the site is never bare.
  const keywords = settings.metaKeywords?.trim()
    ? settings.metaKeywords.split(",").map((k) => k.trim()).filter(Boolean)
    : [...siteConfig.keywords];
  const description = settings.metaDescription?.trim() || siteConfig.description;
  const title = `${settings.siteName} — ${settings.tagline}`;

  return {
    ...baseMetadata,
    title: { default: title, template: `%s · ${settings.siteName}` },
    description,
    keywords,
    applicationName: settings.siteName,
    openGraph: {
      ...baseMetadata.openGraph,
      siteName: settings.siteName,
      title,
      description,
    },
    twitter: { ...baseMetadata.twitter, title: settings.siteName, description },
    icons: { icon: faviconUrl, apple: faviconUrl },
    // Search Console proves ownership by reading this tag off the site. Only
    // emitted once a code is saved, so an unconnected site stays clean.
    ...(googleSiteVerification
      ? { verification: { google: googleSiteVerification } }
      : {}),
  };
}

const baseMetadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  keywords: [...siteConfig.keywords],
  authors: [{ name: siteConfig.name }],
  openGraph: {
    type: "website",
    locale: siteConfig.locale,
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: siteConfig.themeColor.light },
    { media: "(prefers-color-scheme: dark)", color: siteConfig.themeColor.dark },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [branding, tracking] = await Promise.all([getBranding(), getTracking()]);

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <SiteTrackingNoScript tracking={tracking} />
        <AppProviders branding={branding}>{children}</AppProviders>
        <SiteTracking tracking={tracking} />
      </body>
    </html>
  );
}
