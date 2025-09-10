# Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run -s build
RUN npm prune --omit=dev

# Runtime
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 8080
# With tsconfig { rootDir: "server", outDir: "dist" }, the entry is dist/index.js
CMD ["node","dist/index.js"]
