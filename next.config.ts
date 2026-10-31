import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mammoth", "@kenjiuno/msgreader", "pg"],
};

export default nextConfig;
