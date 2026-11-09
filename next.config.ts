import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  // Permit scans are uploaded through server actions. Vercel caps request bodies at 4.5 MB.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // Tanya LDMS lives in the floating chat now; old /tanya links go to the dashboard.
  async redirects() { return [{ source: "/tanya", destination: "/", permanent: false }]; },
};

export default nextConfig;
