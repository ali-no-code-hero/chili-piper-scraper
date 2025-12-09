require('dotenv').config();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optimized for App Platform
  output: 'standalone',
  // Exclude problematic packages from server-side bundling
  serverExternalPackages: ['jsonwebtoken', 'bcryptjs', 'semver'],
  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
}

module.exports = nextConfig