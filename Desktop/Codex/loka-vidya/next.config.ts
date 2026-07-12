import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  output: "export",
  basePath: "/loka-vidya",
  assetPrefix: "/loka-vidya",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
