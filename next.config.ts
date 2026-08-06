import type { NextConfig } from "next";
import path from "path";
import os from "os";

// Desktop/iCloud sync can delete `.next` mid-run and crash the dev server.
// Keep the build cache outside the project folder during local development.
const distDir =
  process.env.NODE_ENV === "production"
    ? ".next"
    : path.join(os.tmpdir(), "servicesync-msp-next");

const nextConfig: NextConfig = {
  distDir,
  // Keep the dev indicator clear of the docked sidebar.
  devIndicators: {
    position: "bottom-right",
  },
};

export default nextConfig;
