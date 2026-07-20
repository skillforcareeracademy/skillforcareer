import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
