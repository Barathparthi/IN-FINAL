#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_ENV_FILE="${SCRIPT_DIR}/.env.runtime"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.vm.yml"

DOCKER_PREFIX=()
if ! docker info >/dev/null 2>&1; then
  if sudo -n docker info >/dev/null 2>&1; then
    DOCKER_PREFIX=(sudo)
    echo "Docker requires sudo in this session; using sudo for docker commands."
  else
    echo "Cannot access Docker daemon. Re-login after bootstrap, or run with sudo privileges."
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

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "Compose file not found: ${COMPOSE_FILE}"
  echo "Run deploy first: bash infra/vbox/02_deploy_app.sh"
  exit 1
fi

echo "Containers:"
if [[ -f "${RUNTIME_ENV_FILE}" ]]; then
  "${COMPOSE_CMD[@]}" --env-file "${RUNTIME_ENV_FILE}" -f "${COMPOSE_FILE}" ps
else
  "${COMPOSE_CMD[@]}" -f "${COMPOSE_FILE}" ps
fi

echo
if curl -fsS http://127.0.0.1/health >/dev/null 2>&1; then
  echo "Backend health: OK"
else
  echo "Backend health: FAIL"
fi

VM_IP="$(hostname -I | awk '{print $1}')"
echo "Frontend URL: http://${VM_IP}"
echo "Backend API: http://${VM_IP}/api"

echo
echo "Last 80 backend log lines:"
if [[ -f "${RUNTIME_ENV_FILE}" ]]; then
  "${COMPOSE_CMD[@]}" --env-file "${RUNTIME_ENV_FILE}" -f "${COMPOSE_FILE}" logs --tail=80 backend
else
  "${COMPOSE_CMD[@]}" -f "${COMPOSE_FILE}" logs --tail=80 backend
fi
