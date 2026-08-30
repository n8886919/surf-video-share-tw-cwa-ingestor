ARG BUILD_FROM=ghcr.io/home-assistant/base:3.24

FROM --platform=$BUILDPLATFORM node:22.22.3-alpine3.22 AS build
WORKDIR /build
COPY package.json package-lock.json tsconfig.json tsconfig.build.json ./
RUN npm ci
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22.22.3-alpine3.22 AS node_runtime

FROM $BUILD_FROM
WORKDIR /app
COPY --from=node_runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=build /build/package.json ./package.json
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/dist ./dist
COPY --chmod=0755 run.sh /run.sh

ARG BUILD_VERSION=dev
ARG BUILD_ARCH=unknown
LABEL \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.type="app" \
  io.hass.arch="${BUILD_ARCH}"

CMD ["/run.sh"]
