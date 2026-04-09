#!/usr/bin/env bash
set -Eeuo pipefail

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required on this system."
  exit 1
fi

TARGET_USER="${SUDO_USER:-$USER}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-2}"

echo "[1/5] Installing Ubuntu packages..."
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl git nginx jq pwgen openssl rsync \
  docker.io docker-compose-plugin

if ! docker compose version >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose
fi

echo "[2/5] Enabling Docker and Nginx..."
sudo systemctl enable docker
sudo systemctl start docker
sudo systemctl enable nginx
sudo systemctl restart nginx

echo "[3/5] Adding ${TARGET_USER} to docker group..."
if id "${TARGET_USER}" >/dev/null 2>&1; then
  sudo usermod -aG docker "${TARGET_USER}" || true
fi

echo "[4/5] Ensuring swap file..."
if ! sudo swapon --show | grep -q '/swapfile'; then
  sudo fallocate -l "${SWAP_SIZE_GB}G" /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count="$((SWAP_SIZE_GB * 1024))"
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  if ! grep -q '^/swapfile ' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  fi
fi

echo "[5/5] Bootstrap complete."
echo "Next steps:"
echo "  cp infra/vbox/.env.vm.example infra/vbox/.env.vm"
echo "  nano infra/vbox/.env.vm"
echo "  bash infra/vbox/02_deploy_app.sh"
echo
if groups "${TARGET_USER}" | grep -q '\bdocker\b'; then
  echo "Docker group is active for ${TARGET_USER}."
else
  echo "Re-login once so ${TARGET_USER} can run docker without sudo."
fi
