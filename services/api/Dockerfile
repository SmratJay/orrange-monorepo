# ===============================================
# API SERVICE DOCKERFILE - PRODUCTION READY
# ===============================================

# Build stage
FROM node:18-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/api/package.json ./services/api/
COPY packages/*/package.json ./packages/*/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client
RUN cd services/api && pnpm exec prisma generate

# Build the application
RUN pnpm --filter @orrange/api build

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
RUN adduser -S orrange -u 1001

# Copy package files
COPY --chown=orrange:nodejs package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=orrange:nodejs services/api/package.json ./services/api/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built application
COPY --from=builder --chown=orrange:nodejs /app/services/api/dist ./services/api/dist
COPY --from=builder --chown=orrange:nodejs /app/services/api/prisma ./services/api/prisma
COPY --from=builder --chown=orrange:nodejs /app/node_modules/.prisma ./node_modules/.prisma

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Switch to non-root user
USER orrange

# Expose port
EXPOSE 8080

# Start the application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "services/api/dist/server.js"]
