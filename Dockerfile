# syntax=docker/dockerfile:1
# Builds the chat app and serves it with nginx.
#   docker build -t iemanchat-web .
# (Mini apps live in the separate mechat-miniapps repo, with their own image.)
# Config is injected at container start (see docker/40-env-js.sh), so one image works anywhere.

FROM node:22-alpine AS build
ARG APP_DIR=apps/web
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/miniapp-sdk/package.json packages/miniapp-sdk/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter "./${APP_DIR}" build

FROM nginx:1.27-alpine
ARG APP_DIR=apps/web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 docker/40-env-js.sh /docker-entrypoint.d/40-env-js.sh
COPY --from=build /repo/${APP_DIR}/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
