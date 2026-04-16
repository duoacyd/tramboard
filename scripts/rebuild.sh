#!/bin/bash
# Usage: ./rebuild.sh [--no-cache] [-y|--yes]
set -euo pipefail

NO_CACHE_FLAG=""
AUTO_YES=false

for arg in "$@"; do
    case $arg in
        --no-cache) NO_CACHE_FLAG="--no-cache" ;;
        -y|--yes) AUTO_YES=true ;;
    esac
done

APP_DIR="/home/sysadmin/brno-tram-display"
SERVICE_NAME="tram-display"
CONTAINER_NAME="brno-tram-display-tram-display-1"

echo "=== Brno Tram Display - Rebuild ==="
echo ""

cd "$APP_DIR" || { echo "ERROR: $APP_DIR not found"; exit 1; }

CONTAINER_RUNNING=$(docker ps -q -f name=$SERVICE_NAME)
[[ -n "$CONTAINER_RUNNING" ]] && echo "Container is running"

git fetch
git status -uno
echo ""

docker images | grep brno-tram-display || true
echo "Dangling images: $(docker images -f 'dangling=true' -q | wc -l)"
echo ""

if [[ -n "$NO_CACHE_FLAG" ]]; then
    echo "Build: NO cache"
else
    echo "Build: with cache"
fi
echo ""

if [[ "$AUTO_YES" == true ]]; then
    echo "Proceeding (-y)"
else
    read -p "Proceed? (yes/no): " -r REPLY
    echo ""
    [[ ! $REPLY =~ ^[Yy]([Ee][Ss])?$ ]] && { echo "Cancelled."; exit 0; }
fi

echo "Step 1: git pull"
git pull
echo ""

echo "Step 2: stop container"
docker compose down
echo ""

echo "Step 3: remove old container"
docker rm "$CONTAINER_NAME" 2>/dev/null || echo "  (already removed)"
echo ""

echo "Step 4: remove old images"
docker images | grep brno-tram-display | awk '{print $3}' | xargs -r docker rmi -f 2>/dev/null || echo "  (none)"
echo ""

echo "Step 5: build"
DOCKER_BUILDKIT=1 docker compose build $NO_CACHE_FLAG
echo ""

echo "Step 6: start"
docker compose up -d
echo ""

echo "Step 7: cleanup"
docker image prune -f
docker container prune -f
docker network prune -f
echo ""

echo "=== Done ==="
echo ""
docker ps | grep "$SERVICE_NAME"
echo ""
docker images | grep brno-tram-display
echo ""
echo "Logs (last 20):"
sleep 3
docker logs "$CONTAINER_NAME" --tail 20
