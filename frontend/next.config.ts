import type { NextConfig } from "next";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const enforceCsp = process.env.CSP_ENFORCE === "true" || process.env.CSP_ENFORCE === "1";

/**
 * Report-only by default (#8). Set CSP_ENFORCE=true after a soak period with no
 * console/report violations, then redeploy to enforce.
 *
 * Allows Next inline/runtime needs + same-origin PDF worker + API connect.
 * Blocks public CDNs (unpkg/jsdelivr/cdnjs) for scripts/workers.
 */
function buildCsp(): string {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${apiUrl}`,
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
  ];
  return directives.join("; ");
}

const cspHeaderName = enforceCsp
  ? "Content-Security-Policy"
  : "Content-Security-Policy-Report-Only";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    agentUpgrade: "security",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: cspHeaderName, value: buildCsp() },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
