"""PS AI Diffusion Bridge - ComfyUI Extension Entry Point.

When installed as a ComfyUI custom node, this module registers REST API routes
for the PS AI Diffusion plugin to communicate with ComfyUI.
"""
try:
    from .src.comfyui_routes import *
    print("✅ ps-ai-diffusion-bridge loaded")
except ImportError as e:
    # Not running inside ComfyUI or missing dependencies
    pass

# ComfyUI extension metadata (required even if we don't provide custom nodes)
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
