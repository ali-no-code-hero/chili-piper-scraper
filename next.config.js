require('dotenv').config();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optimized for App Platform
  output: 'standalone',
  // Exclude problematic packages from server-side bundling
  serverExternalPackages: ['jsonwebtoken', 'bcryptjs'],
  // Webpack configuration to properly externalize packages
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize jsonwebtoken and its dependencies
      config.externals = config.externals || [];
      config.externals.push({
        'jsonwebtoken': 'commonjs jsonwebtoken',
        'bcryptjs': 'commonjs bcryptjs',
      });
    }
    return config;
  },
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