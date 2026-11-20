import type { NextConfig } from 'next';

// Baseline response headers. The CSP covers framing, <base>, forms and plugins; it deliberately
// has no script-src, because Next.js needs inline scripts that a nonce-based policy would have to cover.
const security = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' }, // share links carry a secret token in the path
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }] : []),
];
const noindex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];

const config: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: process.cwd() }, outputFileTracingRoot: process.cwd(), serverExternalPackages: ['lighthouse', 'playwright', '@axe-core/playwright', 'axe-core', '@electric-sql/pglite', 'bullmq', 'ioredis', 'pg'],
  async headers() {
    return [
      { source: '/:path*', headers: security },
      { source: '/share/:path*', headers: noindex },
      { source: '/app/:path*', headers: noindex },
      { source: '/api/:path*', headers: noindex },
    ];
  },
};
export default config;
