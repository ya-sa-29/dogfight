# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package manifests first for layer caching
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source and build all packages
COPY . .
RUN npm run build

# Stage 2: Production runner
FROM node:22-alpine AS runner

WORKDIR /app

# Copy package manifests
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy only built artifacts from builder
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

# Production environment
ENV NODE_ENV=production
ENV PORT=3000
ARG BUILD_VERSION=dev
ENV BUILD_VERSION=${BUILD_VERSION}

# Health check using Node.js built-in fetch (no wget in alpine)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" || exit 1

EXPOSE 3000

# Exec form so SIGTERM reaches Node directly (not a shell)
CMD ["node", "server/dist/index.js"]
