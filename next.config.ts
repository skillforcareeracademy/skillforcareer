import type { NextConfig } from "next";

/**
 * The content policy, assembled from what the app actually loads.
 *
 * Shipped **report-only** to begin with. A CSP has to name every script,
 * style and frame in the app, and the way you discover you missed one is that
 * the page stops working for everyone at once. Reported rather than enforced,
 * a mistake costs a log line at /api/csp-report; once that is quiet for a
 * while the header name below becomes `Content-Security-Policy` and it bites.
 *
 * `'unsafe-inline'` on scripts is not laziness: Next inlines its bootstrap and
 * its flight payload into every document, and the alternative is a per-request
 * nonce, which makes every page uncacheable. Styles are inline for the same
 * reason, from Tailwind's own output.
 */
const SIGNAL_ORIGIN = (process.env.SIGNAL_URL ?? "").replace(/\/+$/, "");
const SIGNAL_WS = SIGNAL_ORIGIN.replace(/^http/, "ws");

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
  // Razorpay's checkout and the academy's own Google tag, which Settings can
  // switch on at any time.
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://*.razorpay.com https://www.googletagmanager.com https://www.google-analytics.com`,
  "style-src 'self' 'unsafe-inline'",
  // next/font self-hosts, so this is only for the odd inline data: face.
  "font-src 'self' data:",
  // Course art, learner photographs and avatars come from a long list of
  // hosts the academy adds to from the panel; narrowing this to a fixed set
  // would break an image the day somebody pastes a new one.
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  [
    "connect-src 'self'",
    SIGNAL_ORIGIN,
    SIGNAL_WS,
    "https://*.razorpay.com",
    "https://lumberjack.razorpay.com",
    "https://www.google-analytics.com",
    "https://*.googletagmanager.com",
    "https://*.analytics.google.com",
  ]
    .filter(Boolean)
    .join(" "),
  // Recorded lessons, the payment sheet, and the viewer the panel opens Office
  // documents in.
  "frame-src 'self' https://www.youtube.com https://youtube.com https://player.vimeo.com https://*.razorpay.com https://view.officeapps.live.com https://drive.google.com",
  "report-uri /api/csp-report",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /**
   * A self-contained server build (`.next/standalone`) — what the academy's own
   * VPS runs. Only the built output is copied there: no repository, no git
   * history, no source. The code lives in one place, and that is GitHub.
   *
   * Set only for that build (`scripts/deploy-vps.sh` exports SFC_VPS_BUILD), so
   * the hosted deployment keeps building exactly as it does today.
   */
  ...(process.env.SFC_VPS_BUILD === "1" ? { output: "standalone" as const } : {}),
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      // S3-compatible object storage (enabled when STORAGE_DRIVER=s3, Step 6+).
      { protocol: "https", hostname: "**.amazonaws.com" },
      // Free stock imagery / avatars for the marketing site (placeholder content).
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "images.pexels.com" },
      { protocol: "https", hostname: "randomuser.me" },
    ],
  },
  // CJS server-only deps that must not be bundled into the ESM server chunk
  // (bundling nodemailer caused "ReferenceError: require is not defined").
  serverExternalPackages: [
    "mariadb",
    "@prisma/adapter-mariadb",
    "nodemailer",
    "socket.io",
  ],
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "date-fns"],
  },

  /**
   * Headers the site was serving none of.
   *
   * `Referrer-Policy` is the one that mattered. Without it a browser sends the
   * whole URL in the `Referer` header of every outbound request — and this app
   * puts unguessable tokens in URLs: `/pay/<token>` settles a fee without a
   * login, and `/live/room/<code>` opens a class. A learner on either of those
   * who clicked an external link, or whose page loaded a third-party asset,
   * handed the token over. `strict-origin-when-cross-origin` sends the full
   * path to our own origin and only the bare origin to anyone else.
   *
   * The rest are the usual floor: no framing (the admin panel in an invisible
   * iframe is how clickjacking works), no MIME sniffing, and a camera and
   * microphone policy that allows the class room and nothing else.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            // The live class needs both; nothing else here does, and a page
            // that cannot ask is a page that cannot be tricked into asking.
            value:
              "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(self), interest-cohort=()",
          },
          {
            // The framing clause stays enforced on its own: it is the
            // clickjacking defence, it carries no risk of breaking a page,
            // and it should not wait for the rest of the policy to settle.
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'",
          },
          {
            // Everything else, watched rather than enforced. See the note
            // above `CSP` for how and when this becomes binding.
            key: "Content-Security-Policy-Report-Only",
            value: CSP,
          },
        ],
      },
      {
        // Links sent to one person. Told not to index even if something
        // reaches them with a crawler's user agent.
        source: "/:path(pay|live)/:rest*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
