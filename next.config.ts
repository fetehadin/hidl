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
  // A self-contained server build for the Docker image (Dockerfile). Vercel ignores it.
  output: "standalone",
  // Hidi's quick menu owns the bottom-right corner and the side nav the left edge; keep the
  // dev-only badge out of both.
  devIndicators: { position: "top-right" },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The tab icon is re-requested on every client navigation; without a lifetime it cost a
      // round trip each time (Next serves it with max-age=0, must-revalidate).
      { source: "/icon.svg", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
      // The memories board's cloud pictures. Change the file names if you regenerate them.
      { source: "/clouds/:file", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
  experimental: {
    // Client-side reuse of pages you've just seen, so switching back and forth between tabs
    // doesn't wait on the server each time (Next 16 defaults dynamic pages to 0s). In-app
    // changes still show at once: every server action that mutates calls revalidatePath,
    // which clears this cache. `static` also covers the fully prefetched tabs (nav.tsx).
    staleTimes: { dynamic: 30, static: 120 },
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
