#!/bin/bash
# Sync shared modules from krita-ai-diffusion

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PS_DIR="$(dirname "$SCRIPT_DIR")"
KRITA_DIR="/Users/newraina/Code/krita-ai-diffusion"

echo "==> Updating krita-ai-diffusion split branch..."
cd "$KRITA_DIR"
git subtree split --prefix=ai_diffusion -b ai_diffusion-only

echo "==> Fetching and merging into ps-ai-diffusion..."
cd "$PS_DIR"
git fetch krita ai_diffusion-only
git subtree pull --prefix=packages/shared krita/ai_diffusion-only --squash

echo "==> Updating .source file..."
COMMIT=$(cd "$KRITA_DIR" && git rev-parse --short HEAD)
cat > "$PS_DIR/packages/shared/.source" << EOF
upstream: https://github.com/Acly/krita-ai-diffusion
path: ai_diffusion
last_sync: $(date +%Y-%m-%d)
commit: $COMMIT
EOF
git add packages/shared/.source

echo "==> Done! Run tests to verify:"
echo "    cd packages/bridge && source .venv/bin/activate && PYTHONPATH=. pytest tests/ -v"
