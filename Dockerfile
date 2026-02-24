# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/
RUN npm ci --workspaces

COPY tsconfig.base.json ./
COPY client/ ./client/
COPY server/ ./server/

RUN npm run build -w server
RUN npm run build -w client

# Stage 2: API server
FROM node:20-alpine AS app

RUN apk add --no-cache postgresql16-client

WORKDIR /app

COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/server/drizzle ./server/drizzle
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./

COPY db/seed-data/ ./db/seed-data/
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
RUN chmod +x ./scripts/docker-entrypoint.sh

RUN npm ci --workspace=server --omit=dev

ENV NODE_ENV=production
EXPOSE 3000

CMD ["./scripts/docker-entrypoint.sh"]

# Stage 3: Nginx with client assets
FROM nginx:alpine AS nginx

COPY --from=builder /app/client/dist /usr/share/nginx/html
