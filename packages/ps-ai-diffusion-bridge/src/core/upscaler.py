"""Upscale workflow builder for ComfyUI.

Builds a simple upscale workflow using UpscaleModelLoader and ImageUpscaleWithModel nodes.
"""
import base64
import uuid
from pathlib import Path

DEFAULT_UPSCALE_MODEL = "4x-UltraSharp.pth"
MAX_INPUT_SIZE = 2048  # Maximum input image size (longest edge)


def build_upscale_workflow(
    image_filename: str,
    factor: float = 4.0,
    model: str = "",
) -> dict:
    """Build an upscale workflow for ComfyUI.

    Args:
        image_filename: Filename of the image in ComfyUI input folder
        factor: Upscale factor (2.0 or 4.0)
        model: Upscale model name (default: 4x-UltraSharp.pth)

    Returns:
        ComfyUI workflow dict
    """
    model_name = model or DEFAULT_UPSCALE_MODEL

    workflow = {
        "1": {
            "class_type": "LoadImage",
            "inputs": {
                "image": image_filename
            }
        },
        "2": {
            "class_type": "UpscaleModelLoader",
            "inputs": {
                "model_name": model_name
            }
        },
        "3": {
            "class_type": "ImageUpscaleWithModel",
            "inputs": {
                "upscale_model": ["2", 0],
                "image": ["1", 0]
            }
        },
    }

    if factor == 4.0:
        # Direct 4x output
        workflow["4"] = {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": "ps_ai_upscale",
                "images": ["3", 0]
            }
        }
    else:
        # Need to scale down from 4x to target factor
        # For 2x: scale to 50% of 4x result
        workflow["4"] = {
            "class_type": "ImageScale",
            "inputs": {
                "image": ["3", 0],
                "upscale_method": "lanczos",
                "width": 0,  # Will be computed by ComfyUI based on ratio
                "height": 0,
                "crop": "disabled"
            }
        }
        workflow["5"] = {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": "ps_ai_upscale",
                "images": ["4", 0]
            }
        }

    return workflow


async def save_base64_image(image_base64: str, comfy_input_dir: str) -> str:
    """Save a base64 image to ComfyUI input folder.

    Args:
        image_base64: Base64 encoded PNG image
        comfy_input_dir: Path to ComfyUI input folder

    Returns:
        Filename of saved image
    """
    # Strip data URL prefix if present
    if "," in image_base64:
        image_base64 = image_base64.split(",")[1]

    image_data = base64.b64decode(image_base64)
    filename = f"ps_upscale_{uuid.uuid4().hex[:8]}.png"
    filepath = Path(comfy_input_dir) / filename

    with open(filepath, "wb") as f:
        f.write(image_data)

    return filename
