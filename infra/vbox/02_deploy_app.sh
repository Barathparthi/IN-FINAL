#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

CONFIG_FILE="${CONFIG_FILE:-${SCRIPT_DIR}/.env.vm}"
RUNTIME_ENV_FILE="${SCRIPT_DIR}/.env.runtime"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.vm.yml"
DOCKERFILE_FILE="${SCRIPT_DIR}/backend.vm.Dockerfile"
DB_INIT_FILE="${SCRIPT_DIR}/init-db.sql"
FRONTEND_ENV_FILE="${REPO_ROOT}/frontend/.env.production.local"
NGINX_SITE_FILE="/etc/nginx/sites-available/default"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

if [[ ! -f "${CONFIG_FILE}" ]]; then
  echo "Config file not found: ${CONFIG_FILE}"
  echo "Create it from the template first:"
  echo "  cp infra/vbox/.env.vm.example infra/vbox/.env.vm"
  exit 1
fi

for cmd in docker curl pwgen sudo rsync; do
  require_cmd "$cmd"
done

DOCKER_PREFIX=()
if ! docker info >/dev/null 2>&1; then
  if sudo -n docker info >/dev/null 2>&1; then
    DOCKER_PREFIX=(sudo)
    echo "Docker requires sudo in this session; using sudo for docker commands."
  else
    echo "Cannot access Docker daemon. Re-login after running bootstrap, or run with sudo privileges."
    exit 1
  fi
fi

DOCKER_CMD=("${DOCKER_PREFIX[@]}" docker)

if "${DOCKER_CMD[@]}" compose version >/dev/null 2>&1; then
  COMPOSE_CMD=("${DOCKER_CMD[@]}" compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=("${DOCKER_PREFIX[@]}" docker-compose)
else
  echo "Neither 'docker compose' nor 'docker-compose' is available."
  exit 1
fi

if [[ -f "${RUNTIME_ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${RUNTIME_ENV_FILE}"
  set +a
fi

set -a
# shellcheck disable=SC1090
source "${CONFIG_FILE}"
set +a

PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL%/}"
if [[ -z "${PUBLIC_BASE_URL}" ]]; then
  echo "PUBLIC_BASE_URL is required in ${CONFIG_FILE}."
  exit 1
fi

if [[ -z "${GROQ_API_KEY:-}" && -z "${OPENAI_API_KEY:-}" ]]; then
  echo "Set at least one key in ${CONFIG_FILE}: GROQ_API_KEY or OPENAI_API_KEY"
  exit 1
fi

POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(pwgen -s 32 1)}"
JWT_SECRET="${JWT_SECRET:-$(pwgen -s 64 1)}"
JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-$(pwgen -s 64 1)}"

OPENAI_API_KEY="${OPENAI_API_KEY:-${GROQ_API_KEY:-}}"
GROQ_API_KEY="${GROQ_API_KEY:-${OPENAI_API_KEY}}"

NODE_ENV="${NODE_ENV:-production}"
PORT="${PORT:-4000}"
JWT_EXPIRES_IN="${JWT_EXPIRES_IN:-15m}"
JWT_REFRESH_EXPIRES_IN="${JWT_REFRESH_EXPIRES_IN:-7d}"

CLIENT_URL="${CLIENT_URL:-${PUBLIC_BASE_URL}}"
FRONTEND_URL="${FRONTEND_URL:-${PUBLIC_BASE_URL}}"
BACKEND_URL="${BACKEND_URL:-${PUBLIC_BASE_URL}}"

DATABASE_URL="${DATABASE_URL:-postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/indium_db}"
REDIS_URL="${REDIS_URL:-redis://redis:6379}"

OPENAI_BASE_URL="${OPENAI_BASE_URL:-https://api.groq.com/openai/v1}"
OPENAI_MODEL="${OPENAI_MODEL:-llama-3.3-70b-versatile}"
OPENAI_TTS_MODEL="${OPENAI_TTS_MODEL:-tts-1}"
OPENAI_STT_MODEL="${OPENAI_STT_MODEL:-whisper-large-v3-turbo}"

JUDGE0_API_URL="${JUDGE0_API_URL:-http://judge0-server:2358}"
JUDGE0_API_KEY="${JUDGE0_API_KEY:-}"
JUDGE0_MEMORY_LIMIT_DEFAULT_KB="${JUDGE0_MEMORY_LIMIT_DEFAULT_KB:-512000}"
JUDGE0_MEMORY_LIMIT_JS_KB="${JUDGE0_MEMORY_LIMIT_JS_KB:-640000}"
JUDGE0_MEMORY_LIMIT_JAVA_KB="${JUDGE0_MEMORY_LIMIT_JAVA_KB:-2097152}"

SMTP_HOST="${SMTP_HOST:-smtp.gmail.com}"
SMTP_PORT="${SMTP_PORT:-587}"
SMTP_SECURE="${SMTP_SECURE:-false}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASS="${SMTP_PASS:-}"
SMTP_FROM="${SMTP_FROM:-${SMTP_USER}}"

CLOUDINARY_CLOUD_NAME="${CLOUDINARY_CLOUD_NAME:-}"
CLOUDINARY_API_KEY="${CLOUDINARY_API_KEY:-}"
CLOUDINARY_API_SECRET="${CLOUDINARY_API_SECRET:-}"

AZURE_TENANT_ID="${AZURE_TENANT_ID:-placeholder-tenant-id}"
AZURE_CLIENT_ID="${AZURE_CLIENT_ID:-placeholder-client-id}"
AZURE_CLIENT_SECRET="${AZURE_CLIENT_SECRET:-placeholder-client-secret}"
GRAPH_SENDER_EMAIL="${GRAPH_SENDER_EMAIL:-noreply@example.com}"

VITE_APP_NAME="${VITE_APP_NAME:-Indium AI}"

echo "[1/7] Writing runtime environment..."
cat > "${RUNTIME_ENV_FILE}" <<EOF
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

DATABASE_URL=${DATABASE_URL}
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=${JWT_EXPIRES_IN}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_REFRESH_EXPIRES_IN=${JWT_REFRESH_EXPIRES_IN}

PORT=${PORT}
NODE_ENV=${NODE_ENV}
CLIENT_URL=${CLIENT_URL}
FRONTEND_URL=${FRONTEND_URL}
BACKEND_URL=${BACKEND_URL}

OPENAI_API_KEY=${OPENAI_API_KEY}
OPENAI_BASE_URL=${OPENAI_BASE_URL}
OPENAI_MODEL=${OPENAI_MODEL}
OPENAI_TTS_MODEL=${OPENAI_TTS_MODEL}
OPENAI_STT_MODEL=${OPENAI_STT_MODEL}
GROQ_API_KEY=${GROQ_API_KEY}

JUDGE0_API_URL=${JUDGE0_API_URL}
JUDGE0_API_KEY=${JUDGE0_API_KEY}
JUDGE0_MEMORY_LIMIT_DEFAULT_KB=${JUDGE0_MEMORY_LIMIT_DEFAULT_KB}
JUDGE0_MEMORY_LIMIT_JS_KB=${JUDGE0_MEMORY_LIMIT_JS_KB}
JUDGE0_MEMORY_LIMIT_JAVA_KB=${JUDGE0_MEMORY_LIMIT_JAVA_KB}

AZURE_TENANT_ID=${AZURE_TENANT_ID}
AZURE_CLIENT_ID=${AZURE_CLIENT_ID}
AZURE_CLIENT_SECRET=${AZURE_CLIENT_SECRET}
GRAPH_SENDER_EMAIL=${GRAPH_SENDER_EMAIL}

CLOUDINARY_CLOUD_NAME=${CLOUDINARY_CLOUD_NAME}
CLOUDINARY_API_KEY=${CLOUDINARY_API_KEY}
CLOUDINARY_API_SECRET=${CLOUDINARY_API_SECRET}

SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT}
SMTP_SECURE=${SMTP_SECURE}
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
SMTP_FROM=${SMTP_FROM}

REDIS_URL=${REDIS_URL}
EOF

cat > "${DB_INIT_FILE}" <<'SQL'
CREATE DATABASE indium_db;
CREATE DATABASE judge0;
SQL

cat > "${DOCKERFILE_FILE}" <<'DOCKERFILE'
FROM node:20-alpine

RUN apk --no-cache add postgresql-client openssl

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci

COPY backend ./
RUN npx prisma generate
RUN npm run build

EXPOSE 4000
CMD sh -c 'until pg_isready -h "postgres" -p "5432" -U "postgres"; do echo "Waiting for Postgres..."; sleep 2; done; npx prisma migrate deploy && npm run start'
DOCKERFILE

cat > "${COMPOSE_FILE}" <<'YAML'
version: '3.8'

services:
  postgres:
    image: postgres:13
    env_file:
      - ./.env.runtime
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    restart: unless-stopped
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./init-db.sql:/docker-entrypoint-initdb.d/init-db.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 12

  redis:
    image: redis:6.2
    command: ["redis-server", "--appendonly", "yes"]
    restart: unless-stopped
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD-SHELL", "redis-cli ping | grep PONG"]
      interval: 10s
      timeout: 5s
      retries: 12

  judge0-server:
    image: judge0/judge0:1.13.1
    env_file:
      - ./.env.runtime
    environment:
      PORT: 2358
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/judge0
      POSTGRES_HOST: postgres
      POSTGRES_PORT: 5432
      POSTGRES_DB: judge0
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      REDIS_HOST: redis
      REDIS_PORT: 6379
      MEMORY_LIMIT: 524288
      MAX_MEMORY_LIMIT: 2097152
    ports:
      - "2358:2358"
    restart: unless-stopped
    privileged: true
    depends_on:
      - postgres
      - redis

  judge0-worker:
    image: judge0/judge0:1.13.1
    command: ["./scripts/workers"]
    env_file:
      - ./.env.runtime
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/judge0
      POSTGRES_HOST: postgres
      POSTGRES_PORT: 5432
      POSTGRES_DB: judge0
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      REDIS_HOST: redis
      REDIS_PORT: 6379
      MEMORY_LIMIT: 524288
      MAX_MEMORY_LIMIT: 2097152
    restart: unless-stopped
    privileged: true
    depends_on:
      - postgres
      - redis

  backend:
    build:
      context: ../..
      dockerfile: infra/vbox/backend.vm.Dockerfile
    env_file:
      - ./.env.runtime
    ports:
      - "4000:4000"
    restart: unless-stopped
    depends_on:
      - postgres
      - judge0-server

volumes:
  postgres-data:
  redis-data:
YAML

echo "[2/7] Building frontend in a Node 20 container..."
cat > "${FRONTEND_ENV_FILE}" <<EOF
VITE_API_BASE_URL=${PUBLIC_BASE_URL}/api
VITE_BACKEND_URL=${PUBLIC_BASE_URL}
VITE_APP_NAME=${VITE_APP_NAME}
EOF

"${DOCKER_CMD[@]}" run --rm \
  --user "$(id -u):$(id -g)" \
  -v "${REPO_ROOT}/frontend:/app" \
  -w /app \
  node:20-alpine \
  sh -lc "npm ci && npm run build"

echo "[3/7] Publishing frontend to Nginx web root..."
sudo mkdir -p /var/www/indium
sudo rsync -a --delete "${REPO_ROOT}/frontend/dist/" /var/www/indium/

echo "[4/7] Configuring Nginx reverse proxy..."
sudo tee "${NGINX_SITE_FILE}" >/dev/null <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /var/www/indium;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://127.0.0.1:4000/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:4000/uploads/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /downloads/ {
        proxy_pass http://127.0.0.1:4000/downloads/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX

sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx

echo "[5/7] Starting Postgres and Redis..."
"${COMPOSE_CMD[@]}" --env-file "${RUNTIME_ENV_FILE}" -f "${COMPOSE_FILE}" up -d postgres redis

echo "[6/7] Waiting for Postgres and starting Judge0 + backend..."
for i in $(seq 1 60); do
  if "${COMPOSE_CMD[@]}" --env-file "${RUNTIME_ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

"${COMPOSE_CMD[@]}" --env-file "${RUNTIME_ENV_FILE}" -f "${COMPOSE_FILE}" up -d judge0-server judge0-worker
"${COMPOSE_CMD[@]}" --env-file "${RUNTIME_ENV_FILE}" -f "${COMPOSE_FILE}" up -d --build backend

echo "[7/7] Running health checks..."
for i in $(seq 1 90); do
  if curl -fsS http://127.0.0.1/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

curl -fsS http://127.0.0.1/health >/dev/null

echo
echo "Deployment complete."
echo "Frontend: ${PUBLIC_BASE_URL}"
echo "Backend API: ${PUBLIC_BASE_URL}/api"
echo "Health: ${PUBLIC_BASE_URL}/health"
echo "Compose file: ${COMPOSE_FILE}"
echo "Runtime env: ${RUNTIME_ENV_FILE}"
