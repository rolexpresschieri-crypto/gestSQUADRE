import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Solo dev locale: evita che Turbopack usi C:\Users\rronc\ come root (lockfile spurio).
  ...(process.env.NODE_ENV === "development"
    ? { turbopack: { root: process.cwd() } }
    : {}),
};

export default nextConfig;
