# ─── Builder ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /build
COPY package.json tsconfig.json ./
RUN npm install
COPY src/ src/
COPY public/ public/
RUN npm run build

# ─── Runtime ────────────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app
COPY --from=builder /build/dist/ dist/
COPY --from=builder /build/public/ public/
COPY --from=builder /build/package.json .
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3100/api/status || exit 1
CMD ["node", "dist/index.js", "--web", "--port", "3100"]
