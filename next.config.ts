import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev indicator clear of the docked sidebar.
  devIndicators: {
    position: "bottom-right",
  },
};

export default nextConfig;
