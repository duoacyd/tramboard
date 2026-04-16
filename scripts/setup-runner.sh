#!/bin/bash
# Interactive setup guide for the GitHub Actions self-hosted runner.
# Handles download, config, systemd service install, and Docker group membership.
# Safe to re-run: skips the download if ~/actions-runner/ already exists.
#
# Prerequisites: curl, tar, docker (Ubuntu 24 LTS)

set -euo pipefail

RUNNER_DIR="$HOME/actions-runner"
RUNNER_USER="${USER}"

echo "========================================================"
echo "  Brno Tram Display — GitHub Actions Runner Setup"
echo "========================================================"
echo ""
echo "Step 1 of 2: Get a runner registration token"
echo "  1. Open your browser and go to:"
echo "     https://github.com/OWNER/REPO/settings/actions/runners/new"
echo "     (replace OWNER/REPO with your actual repository path)"
echo "  2. GitHub will show a token under 'Configure' — copy it."
echo ""

read -rp "Enter your GitHub repository URL (e.g. https://github.com/mszuc/brno-tram-display): " REPO_URL
read -rp "Enter the runner registration token: " RUNNER_TOKEN
echo ""

# ── Download ──────────────────────────────────────────────────────────────────

if [[ -d "$RUNNER_DIR" ]]; then
  echo "ℹ  $RUNNER_DIR already exists — skipping download, going straight to config."
else
  echo "Fetching latest runner version from GitHub API..."
  LATEST_TAG=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest \
    | grep '"tag_name"' | head -1 | sed 's/.*"v\([^"]*\)".*/\1/')
  echo "Latest runner version: $LATEST_TAG"

  TARBALL="actions-runner-linux-x64-${LATEST_TAG}.tar.gz"
  DOWNLOAD_URL="https://github.com/actions/runner/releases/download/v${LATEST_TAG}/${TARBALL}"

  echo "Downloading $TARBALL ..."
  mkdir -p "$RUNNER_DIR"
  curl -fsSL -o "$RUNNER_DIR/$TARBALL" "$DOWNLOAD_URL"

  echo "Extracting to $RUNNER_DIR ..."
  tar -xzf "$RUNNER_DIR/$TARBALL" -C "$RUNNER_DIR"
  rm "$RUNNER_DIR/$TARBALL"
fi

# ── Configure ─────────────────────────────────────────────────────────────────

echo ""
echo "Configuring runner..."
cd "$RUNNER_DIR"

# Remove stale config so re-runs don't require --replace interactively
if [[ -f ".runner" ]]; then
  echo "ℹ  Existing runner config found — removing before reconfiguring."
  ./config.sh remove --token "$RUNNER_TOKEN" 2>/dev/null || true
fi

./config.sh \
  --url "$REPO_URL" \
  --token "$RUNNER_TOKEN" \
  --name brno-tram-display \
  --labels self-hosted \
  --unattended

# ── Systemd service ───────────────────────────────────────────────────────────

echo ""
echo "Installing and starting systemd service..."
sudo ./svc.sh install
sudo ./svc.sh start

# ── Docker group membership ───────────────────────────────────────────────────

echo ""
echo "Granting Docker access to runner user ($RUNNER_USER)..."
# Adding to the docker group means the runner can call 'docker' without sudo.
# The new-group membership takes effect on next login / service restart.
sudo usermod -aG docker "$RUNNER_USER"
echo "ℹ  Docker group membership takes effect on the next login or service restart."
echo "   To apply immediately without logging out, run:"
echo "     newgrp docker"
echo "   Then restart the runner service:"
echo "     sudo $(realpath "$RUNNER_DIR/svc.sh") restart"

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "========================================================"
echo "  Setup complete!"
echo "========================================================"
echo ""
echo "Runner service status:"
sudo ./svc.sh status || true
echo ""
echo "Reminder: scripts/rebuild.sh uses plain 'docker' (no sudo)."
echo "If the runner user is not yet in the docker group, restart the service"
echo "after running 'newgrp docker' or logging out and back in."

# Assisted-by: Claude (Anthropic)
