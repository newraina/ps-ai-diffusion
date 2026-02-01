# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered image generation plugin for Adobe Photoshop. Uses Stable Diffusion models via ComfyUI from within Photoshop and writes results to new layers.

**Architecture:** Three independent components:
- **UXP Plugin** (`packages/plugin/`) - React 18 + TypeScript UI running in Photoshop
- **Python Bridge** (`packages/ps-ai-diffusion-bridge/`) - FastAPI REST API service (port 7860) or ComfyUI extension
- **Shared Modules** (`packages/shared/`) - Core modules reused from krita-ai-diffusion via git subtree

**Communication Flow (Standalone Mode):**
```
Photoshop UXP Plugin ←→ Python Bridge ←→ ComfyUI
                        (localhost:7860)  (localhost:8188)
```

**Communication Flow (ComfyUI Extension Mode):**
```
Photoshop UXP Plugin ←→ ComfyUI (with ps-ai-diffusion-bridge extension)
                        (localhost:8188)
```

## Build & Development Commands

### Python Bridge (Standalone)
```bash
cd packages/ps-ai-diffusion-bridge
python -m venv .venv
source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt

# Run service
python run.py
# or: ./scripts/start-bridge.sh
```

### Python Bridge (ComfyUI Extension)
```bash
# Symlink to ComfyUI custom_nodes
ln -s /path/to/packages/ps-ai-diffusion-bridge /path/to/ComfyUI/custom_nodes/ps-ai-diffusion-bridge

# Restart ComfyUI - API available at /api/ps-ai-diffusion-bridge/*
```

### UXP Plugin
```bash
cd packages/plugin
pnpm install
pnpm run dev      # Vite dev server
pnpm run build    # Production build
```

### Testing
```bash
cd packages/ps-ai-diffusion-bridge
source .venv/bin/activate
PYTHONPATH=. pytest tests/ -v           # All tests
PYTHONPATH=. pytest tests/test_health.py -v  # Single file
```

### Loading Plugin in Photoshop
1. Open Photoshop 2024+
2. Plugins → Development → UXP Developer Tool
3. Add Plugin → Select `packages/plugin/manifest.json`
4. Click "Load"

## Key Architectural Patterns

### Module Path Setup
Shared modules use relative imports from krita-ai-diffusion. Any Python module using shared must import path_setup first:
```python
import src.path_setup  # noqa: F401
from shared.api import WorkflowInput
```

### State Management
Global `AppState` dataclass in `src/core/state.py` tracks connection status, backend type, and errors.

### Async Pattern
FastAPI uses async handlers with aiohttp for HTTP calls to ComfyUI.

## API Endpoints

**Standalone mode (Bridge :7860):**
```
GET  /api/health                → {"status": "ok"}
GET  /api/connection            → ConnectionStatus
POST /api/connection            → Connect to backend
POST /api/generate              → Submit generation task
GET  /api/jobs/{job_id}         → Job status
GET  /api/jobs/{job_id}/images  → Generated images (base64)
POST /api/jobs/{job_id}/cancel  → Cancel job
```

**ComfyUI extension mode (:8188):**
Same endpoints, prefixed with `/api/ps-ai-diffusion-bridge/`

## Key Files

| Path | Purpose |
|------|---------|
| `packages/ps-ai-diffusion-bridge/src/fastapi_app.py` | FastAPI app, endpoints |
| `packages/ps-ai-diffusion-bridge/src/comfyui_routes.py` | ComfyUI extension routes |
| `packages/ps-ai-diffusion-bridge/src/core/handlers.py` | Framework-agnostic request handlers |
| `packages/ps-ai-diffusion-bridge/src/core/state.py` | Global state management |
| `packages/ps-ai-diffusion-bridge/src/core/comfy_client_manager.py` | ComfyUI client |
| `packages/ps-ai-diffusion-bridge/src/generator.py` | WorkflowInput creation |
| `packages/shared/api.py` | Data model definitions |
| `packages/shared/comfy_client.py` | ComfyUI protocol |
| `packages/plugin/src/app.tsx` | Root component |
| `packages/plugin/src/services/bridge-client.ts` | HTTP API client |

## Syncing Shared Modules

The `packages/shared` directory is managed via git subtree from krita-ai-diffusion:
```bash
./scripts/sync-shared.sh
```
