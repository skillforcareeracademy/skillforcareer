import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
};

export default nextConfig;
