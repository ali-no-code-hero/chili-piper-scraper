/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3']
  },
  env: {
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    JWT_SECRET: process.env.JWT_SECRET,
    CHILI_PIPER_FORM_URL: process.env.CHILI_PIPER_FORM_URL,
    RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS,
    MAX_REQUEST_SIZE_MB: process.env.MAX_REQUEST_SIZE_MB,
    LOG_LEVEL: process.env.LOG_LEVEL,
    ENABLE_AUDIT_LOGS: process.env.ENABLE_AUDIT_LOGS
  }
}

module.exports = nextConfig