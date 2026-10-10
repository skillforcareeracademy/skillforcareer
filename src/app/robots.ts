import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

/**
 * What a crawler may look at.
 *
 * Everything behind a sign-in is listed, not because a crawler could get in —
 * every panel answers 307 and every API 401 — but because a disallowed path
 * is never requested in the first place. The two that matter most are the
 * ones carrying an unguessable token in the URL: a class room and a payment
 * link are sent to one person, and have no business in an index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/instructor/",
        "/student/",
        "/api/",
        "/live/",
        "/pay/",
        "/verify-otp",
        "/reset-password",
      ],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
