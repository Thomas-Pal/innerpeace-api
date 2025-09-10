# ---- Builder ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run -s build
# keep prod deps only for runtime layer
RUN npm prune --omit=dev

# ---- Runtime ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# bring compiled output + prod deps
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 8080
# NOTE: tsconfig rootDir=server → dist/server/index.js
CMD ["node","dist/server/index.js"]
