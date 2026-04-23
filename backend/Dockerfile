# Build stage
FROM node:20-slim AS builder
WORKDIR /app

# Install OpenSSL (Debian already has libssl)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source code and configs
COPY tsconfig.json ./
COPY swagger.js ./
COPY src ./src
COPY prisma ./prisma

# Generate Prisma client and build TypeScript
RUN npx prisma generate
RUN npm run build

# Runtime stage
FROM node:20-slim
WORKDIR /app

# Install OpenSSL in runtime image as well
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy built artifacts and node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/swagger.js ./swagger.js

EXPOSE 4000
CMD ["node", "dist/index.js"]
