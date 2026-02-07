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

# Stage 2: Production
FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/server/drizzle ./server/drizzle
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/package.json ./

RUN npm ci --workspace=server --omit=dev

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server/dist/server.js"]
