# syntax=docker/dockerfile:1
# Build context: repository root (see docker-compose.yml)
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev -w @sp/server -w @sp/shared --include-workspace-root=false && npm cache clean --force

COPY shared/src shared/src
COPY server/src server/src

USER node
EXPOSE 2567
# Node 24 runs the TypeScript sources directly (type stripping) — no build step needed.
CMD ["node", "server/src/index.ts"]
