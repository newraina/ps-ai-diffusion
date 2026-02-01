"""Style loading and sampler preset resolution.

Loads built-in styles from shared/styles/ and sampler presets from shared/presets/samplers.json.
"""
import json
from pathlib import Path
from typing import Any

# Path to shared module
SHARED_DIR = Path(__file__).parent.parent.parent.parent / "shared"
STYLES_DIR = SHARED_DIR / "styles"
SAMPLERS_FILE = SHARED_DIR / "presets" / "samplers.json"

# Cache
_sampler_presets: dict[str, dict] | None = None
_styles: list[dict] | None = None


def load_sampler_presets() -> dict[str, dict]:
    """Load sampler presets from samplers.json."""
    global _sampler_presets
    if _sampler_presets is not None:
        return _sampler_presets

    with open(SAMPLERS_FILE, "r", encoding="utf-8") as f:
        _sampler_presets = json.load(f)
    return _sampler_presets


def load_styles() -> list[dict[str, Any]]:
    """Load all built-in styles from shared/styles/."""
    global _styles
    if _styles is not None:
        return _styles

    _styles = []
    for style_file in sorted(STYLES_DIR.glob("*.json")):
        with open(style_file, "r", encoding="utf-8") as f:
            style_data = json.load(f)
            style_data["id"] = f"built-in/{style_file.name}"
            _styles.append(style_data)

    return _styles


def resolve_sampler(preset_name: str) -> tuple[str, str]:
    """Resolve a sampler preset name to (sampler, scheduler) tuple.

    Args:
        preset_name: Name of the sampler preset (e.g., "Flux - Euler simple")

    Returns:
        Tuple of (sampler, scheduler). Falls back to ("euler", "normal") if not found.
    """
    presets = load_sampler_presets()
    preset = presets.get(preset_name)

    if preset:
        return preset["sampler"], preset["scheduler"]

    # Fallback
    return "euler", "normal"


def get_style_summary(style: dict) -> dict[str, Any]:
    """Get a summary of a style for API response."""
    return {
        "id": style["id"],
        "name": style["name"],
        "architecture": style.get("architecture", "auto"),
        "sampler": style.get("sampler", "Default - DPM++ 2M"),
        "cfg_scale": style.get("cfg_scale", 7.0),
        "steps": style.get("sampler_steps", 20),
        "style_prompt": style.get("style_prompt", "{prompt}"),
        "negative_prompt": style.get("negative_prompt", ""),
        "checkpoints": style.get("checkpoints", []),
    }
