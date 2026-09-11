import type { NextConfig } from "next";

const PRIVATE_API_HEADERS = [
  { key: "Cache-Control", value: "private, no-store" },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const nextConfig: NextConfig = {
  output: process.env.NETLIFY ? undefined : "standalone",
  reactStrictMode: false,
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: PRIVATE_API_HEADERS,
      },
    ];
  },
};

export default nextConfig;
