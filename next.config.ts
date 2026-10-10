import type { NextConfig } from "next";

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
            key: "Content-Security-Policy",
            // Only the framing half for now. A full policy has to list every
            // script and style the app loads, and getting that wrong takes the
            // site down — this part is the clickjacking defence and carries no
            // such risk.
            value: "frame-ancestors 'self'",
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
