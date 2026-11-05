# TrustDrive web app (Next.js 14 App Router).
# Node 22.5+ is required for the built-in node:sqlite driver.
FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM base AS builder
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force
COPY . .
RUN npm run build

FROM base AS runner
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
RUN mkdir -p .data/uploads && chown -R nextjs:nodejs /app
USER nextjs
ENV PORT=3000 \
    TD_DB_FILE=/app/.data/trustdrive.db \
    TD_UPLOAD_DIR=/app/.data/uploads
VOLUME ["/app/.data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start"]
