import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  // Permit scans are uploaded through server actions. Vercel caps request bodies at 4.5 MB.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // Retired screens: old links land on their replacement.
  async redirects() {
    return [
      { source: "/tanya", destination: "/", permanent: false },
      { source: "/sanksi", destination: "/sigap", permanent: false },
      { source: "/terapkan-matrix", destination: "/kb", permanent: false },
      { source: "/matrix", destination: "/kb", permanent: false },
      { source: "/pustaka", destination: "/repository", permanent: false },
      { source: "/hr/:path*", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
