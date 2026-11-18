# The API image for Railway (apps/api + packages/shared), with Chromium for the PDFs.
# Build from the repository root: docker build -t shubhjets-api .

# ---- Build: install, compile, then keep only what production needs ----
FROM node:22.23.4-bookworm-slim AS build
ENV CI=true
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@shubhjets/api..." \
 && pnpm --filter @shubhjets/shared build \
 && pnpm --filter @shubhjets/api build \
 && pnpm --filter @shubhjets/api deploy --prod --legacy --ignore-scripts /out

# ---- Run ----
FROM node:22.23.4-bookworm-slim
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY --from=build /out ./
# Chromium (same version as playwright-core) and the system libraries it needs.
RUN node node_modules/playwright-core/cli.js install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/*
USER node
EXPOSE 3000
# Migrations run on start in production; the owner account is created from ADMIN_EMAIL on a fresh database.
CMD ["node", "dist/main.js"]
