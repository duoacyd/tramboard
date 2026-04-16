#!/bin/bash
# CI deploy script — called by GitHub Actions after checkout.
# Assumes: correct commit already checked out, user is in docker group.
# Do NOT add git pull here — the runner workspace already has the right code.
set -euo pipefail

CONTAINER_NAME="brno-tram-display-tram-display-1"
SERVICE_NAME="tram-display"

echo "=== deploy started: $(pwd) at $(date) ==="

echo "--- stopping container ---"
docker compose down

echo "--- removing old image ---"
docker images | grep brno-tram-display | awk '{print $3}' | xargs -r docker rmi -f || true

echo "--- building ---"
DOCKER_BUILDKIT=1 docker compose build

echo "--- starting ---"
docker compose up -d

echo "--- pruning ---"
docker image prune -f
docker container prune -f
docker network prune -f

echo "--- verifying ---"
sleep 3
docker ps | grep "$SERVICE_NAME" || { echo "ERROR: container not running after deploy"; exit 1; }
docker logs "$CONTAINER_NAME" --tail 10

echo "=== deploy complete ==="

# Assisted-by: Claude (Anthropic)
