import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.NETLIFY ? undefined : "standalone",
  /* config options here */
  reactStrictMode: false,
};

export default nextConfig;
