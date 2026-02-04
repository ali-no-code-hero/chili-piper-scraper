# Use Node.js 20 LTS as base image
FROM node:20-slim

# Install system dependencies required for Playwright
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libatspi2.0-0 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Install Playwright browsers
RUN npx playwright install chromium --with-deps

# Copy application code
COPY . .

# Build Next.js application
RUN npm run build

# Standalone needs static and public copied in (next build does not include them)
RUN cp -r .next/static .next/standalone/.next/static && (cp -r public .next/standalone/public 2>/dev/null || true)

# Expose port
EXPOSE 3000

# Set environment variables (HOSTNAME=0.0.0.0 so proxy can reach the app)
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Start the application (standalone output requires this, not "next start")
CMD ["node", ".next/standalone/server.js"]
