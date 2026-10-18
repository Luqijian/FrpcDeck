# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:22-alpine
ARG FRP_VERSION=0.71.1
ARG FRP_DOWNLOAD_BASE=https://github.com/fatedier/frp/releases/download

FROM ${NODE_IMAGE} AS web-builder
RUN npm install -g pnpm@11.28.5
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web ./web
COPY shared ./shared
RUN pnpm build

FROM ${NODE_IMAGE} AS prod-deps
RUN npm install -g pnpm@11.28.5
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM ${NODE_IMAGE} AS runtime
ARG FRP_VERSION=0.71.1
ARG FRP_DOWNLOAD_BASE=https://github.com/fatedier/frp/releases/download
ARG TARGETARCH=amd64

LABEL org.opencontainers.image.title="FrpcDeck" \
      org.opencontainers.image.description="A modern web UI for frpc configuration and runtime management" \
      org.opencontainers.image.url="https://github.com/Luqijian/FrpcDeck" \
      org.opencontainers.image.source="https://github.com/Luqijian/FrpcDeck" \
      org.opencontainers.image.documentation="https://github.com/Luqijian/FrpcDeck#readme" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="2.1.1"

RUN apk add --no-cache ca-certificates tzdata curl su-exec \
  && case "${TARGETARCH}" in \
       amd64) frp_arch=amd64 ;; \
       arm64) frp_arch=arm64 ;; \
       arm) frp_arch=arm ;; \
       *) echo "Unsupported architecture for frp: ${TARGETARCH}" && exit 1 ;; \
     esac \
  && archive="frp_${FRP_VERSION}_linux_${frp_arch}.tar.gz" \
  && curl -fsSL "${FRP_DOWNLOAD_BASE}/v${FRP_VERSION}/${archive}" -o /tmp/frp.tar.gz \
  && curl -fsSL "${FRP_DOWNLOAD_BASE}/v${FRP_VERSION}/frp_sha256_checksums.txt" -o /tmp/checksums.txt \
  && checksum="$(awk -v file="${archive}" '$2 == file { print $1; exit }' /tmp/checksums.txt)" \
  && test -n "${checksum}" \
  && echo "${checksum}  /tmp/frp.tar.gz" | sha256sum -c - \
  && tar -xzf /tmp/frp.tar.gz -C /tmp \
  && cp "/tmp/frp_${FRP_VERSION}_linux_${frp_arch}/frpc" /usr/local/bin/frpc \
  && chmod 0755 /usr/local/bin/frpc \
  && frpc -v \
  && rm -rf /tmp/*

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    FRPC_BIN=/usr/local/bin/frpc \
    TZ=Asia/Shanghai

COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY LICENSE THIRD_PARTY_NOTICES.md ./
COPY licenses ./licenses
COPY server ./server
COPY shared ./shared
COPY --from=web-builder /app/dist ./dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /data \
  && chmod 700 /data \
  && chown -R node:node /app /data

VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-8080}/api/health" > /dev/null || exit 1

STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server/index.js"]
