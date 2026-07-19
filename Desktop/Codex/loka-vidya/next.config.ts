import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
