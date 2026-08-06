import type { NextConfig } from "next";

// Turbopack requires distDir to stay inside the project directory.
// (Absolute or ../ paths crash the Windows/Turbopack dev server.)
const nextConfig: NextConfig = {
  distDir: ".next",
  // Keep the dev indicator clear of the docked sidebar.
  devIndicators: {
    position: "bottom-right",
  },
};

export default nextConfig;
