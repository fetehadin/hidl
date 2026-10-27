import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is per-user and rendered at request time, so Cache Components/PPR stay off.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
