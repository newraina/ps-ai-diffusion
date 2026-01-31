# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered image generation plugin for Adobe Photoshop. Uses Stable Diffusion models via ComfyUI from within Photoshop and writes results to new layers.

**Architecture:** Three independent components:
- **UXP Plugin** (`packages/plugin/`) - React 19 + TypeScript UI running in Photoshop
- **Python Bridge** (`packages/bridge/`) - FastAPI REST API service (port 7860)
- **Shared Modules** (`packages/shared/`) - Core modules reused from krita-ai-diffusion via git subtree

**Communication Flow:**
```
Photoshop UXP Plugin ←→ Python Bridge ←→ ComfyUI
                        (localhost:7860)  (localhost:8188)
```

## Build & Development Commands

### Python Bridge
```bash
cd packages/bridge
python -m venv .venv
source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt

# Run service
python run.py
# or: ./scripts/start-bridge.sh
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
cd packages/bridge
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
Global `AppState` dataclass in `src/state.py` tracks connection status, backend type, and errors.

### Async Pattern
FastAPI uses async handlers with aiohttp for HTTP calls to ComfyUI.

## API Endpoints (Bridge :7860)

```
GET  /api/health      → {"status": "ok"}
GET  /api/connection  → ConnectionStatus
POST /api/connection  → Connect to backend
POST /api/generate    → Submit generation task
```

## Key Files

| Path | Purpose |
|------|---------|
| `packages/bridge/src/main.py` | FastAPI app, endpoints |
| `packages/bridge/src/generator.py` | WorkflowInput creation |
| `packages/shared/api.py` | Data model definitions |
| `packages/shared/comfy_client.py` | ComfyUI protocol |
| `packages/plugin/src/App.tsx` | Root component |
| `packages/plugin/src/services/bridgeClient.ts` | HTTP API client |

## Syncing Shared Modules

The `packages/shared` directory is managed via git subtree from krita-ai-diffusion:
```bash
./scripts/sync-shared.sh
```
