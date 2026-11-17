import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  // Permit scans are uploaded through server actions. Vercel caps request bodies at 4.5 MB.
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
    // Keep visited pages in the browser's router cache for 30 s: going back to a menu or tab is instant.
    // Every save calls revalidatePath, which clears this cache, so edits still show at once.
    staleTimes: { dynamic: 30, static: 300 },
  },
  // Retired screens: old links land on their replacement.
  async redirects() {
    return [
      { source: "/tanya", destination: "/dashboard", permanent: false },
      { source: "/sanksi", destination: "/", permanent: false },
      { source: "/sigap", destination: "/", permanent: false },
      { source: "/terapkan-matrix", destination: "/kb", permanent: false },
      { source: "/matrix", destination: "/kb", permanent: false },
      { source: "/pustaka", destination: "/repository", permanent: false },
      { source: "/hr/:path*", destination: "/dashboard", permanent: false },
    ];
  },
};

export default nextConfig;
