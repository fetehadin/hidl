import type { NextConfig } from "next";

// Baseline hardening for every response. No CSP here: Next's inline scripts and the
// optional Turnstile widget would need nonces, and nothing here renders user HTML.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Hidi's quick menu owns the bottom-right corner and the side nav the left edge; keep the
  // dev-only badge out of both.
  devIndicators: { position: "top-right" },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
