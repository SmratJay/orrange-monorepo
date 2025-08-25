# ===============================================
# WEB APP DOCKERFILE - PRODUCTION READY
# ===============================================

# Build stage
FROM node:18-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/*/package.json ./packages/*/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the Next.js application
RUN pnpm --filter @orrange/web build

# Production stage
FROM node:18-alpine AS production

# Install pnpm
RUN npm install -g pnpm

# Create app directory
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Copy package files
COPY --chown=nextjs:nodejs package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=nextjs:nodejs apps/web/package.json ./apps/web/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built application
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Start the application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/web/server.js"]
