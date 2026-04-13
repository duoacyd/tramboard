#!/bin/bash
# Rebuild Brno Tram Display with Cleanup - with sudo
# Safely rebuilds the image and cleans up old versions
# Usage: ./sudo-rebuild.sh [--no-cache] [-y|--yes]

# Parse flags
NO_CACHE_FLAG=""
AUTO_YES=false

for arg in "$@"; do
    case $arg in
        --no-cache) NO_CACHE_FLAG="--no-cache" ;;
        -y|--yes) AUTO_YES=true ;;
    esac
done

if [[ -n "$NO_CACHE_FLAG" ]]; then
    echo "⚠️  Building WITHOUT cache (slower but ensures fresh dependencies)"
else
    echo "ℹ️  Building WITH cache (faster, uses cached dependencies)"
fi
echo ""

echo "=== Brno Tram Display - Rebuild with Cleanup ==="
echo ""

APP_DIR="/home/sysadmin/brno-tram-display"
SERVICE_NAME="tram-display"
CONTAINER_NAME="brno-tram-display-tram-display-1"

# Check if container is running
CONTAINER_RUNNING=$(sudo docker ps -q -f name=$SERVICE_NAME)

if [ ! -z "$CONTAINER_RUNNING" ]; then
    echo "✓ Container is currently running"
fi
echo ""

# Git pull
echo "Fetching latest code..."
cd "$APP_DIR" || { echo "ERROR: $APP_DIR not found"; exit 1; }
sudo git fetch
GIT_STATUS=$(sudo git status -uno)
echo "$GIT_STATUS"
echo ""

# Show current image(s)
echo "Current image(s):"
sudo docker images | grep brno-tram-display
echo ""

# Count dangling images
DANGLING_COUNT=$(sudo docker images -f "dangling=true" -q | wc -l)
echo "Dangling images: $DANGLING_COUNT"
echo ""

# Ask for confirmation
echo "This will:"
echo "  1. Pull latest commits (git pull)"
echo "  2. Stop the current container"
echo "  3. Remove old container"
echo "  4. Remove old images"
if [[ -z "$NO_CACHE_FLAG" ]]; then
    echo "  5. Build image (using cached dependencies)"
else
    echo "  5. Build image (NO cache - fresh download)"
fi
echo "  6. Start container"
echo "  7. Clean up dangling images"
echo ""
if [[ "$AUTO_YES" == true ]]; then
    echo "Proceeding automatically (-y flag set)."
else
    read -p "Proceed? (yes/no): " -r REPLY
    echo ""
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]] && [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 0
    fi
fi

# Step 1: Git pull
echo "Step 1: Pulling latest code..."
sudo git pull
echo ""

# Step 2: Stop container
echo "Step 2: Stopping container..."
sudo docker compose down
echo ""

# Step 3: Remove old container
echo "Step 3: Removing old container..."
sudo docker rm "$CONTAINER_NAME" 2>/dev/null || echo "  (already removed)"
echo ""

# Step 4: Remove old images
echo "Step 4: Removing old images..."
sudo docker images | grep brno-tram-display | awk '{print $3}' | xargs -r sudo docker rmi -f 2>/dev/null || echo "  (no old images)"
echo ""

# Step 5: Build
if [[ -z "$NO_CACHE_FLAG" ]]; then
    echo "Step 5: Building image (using cached dependencies)..."
    export DOCKER_BUILDKIT=1
    export COMPOSE_DOCKER_CLI_BUILD=1
    sudo docker compose build
else
    echo "Step 5: Building image (NO cache - fresh download)..."
    sudo docker compose build --no-cache
fi
echo ""

# Step 6: Start
echo "Step 6: Starting container..."
sudo docker compose up -d
echo ""

# Step 7: Cleanup
echo "Step 7: Cleaning up dangling images..."
sudo docker image prune -f
echo ""

echo "Step 8: General cleanup..."
sudo docker container prune -f
sudo docker network prune -f
echo ""

echo "=== Rebuild Complete ==="
echo ""

echo "Container status:"
sudo docker ps | grep "$SERVICE_NAME"
echo ""

echo "New image:"
sudo docker images | grep brno-tram-display
echo ""

echo "Checking logs (last 20 lines)..."
sleep 3
sudo docker logs "$CONTAINER_NAME" --tail 20
