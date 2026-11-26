# syntax=docker/dockerfile:1
# Build context: repository root (see docker-compose.yml)
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci -w @sp/client -w @sp/shared --include-workspace-root
COPY shared shared
COPY client client
RUN npm run build -w @sp/client

FROM nginx:1.29-alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
