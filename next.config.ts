import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mammoth", "@kenjiuno/msgreader", "pg"],
  // Permit scans / contract PDFs are uploaded through server actions. Vercel caps request bodies at 4.5 MB.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
