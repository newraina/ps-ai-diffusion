"""Tests for styles module."""
import pytest
from src.core.styles import load_styles, load_sampler_presets, resolve_sampler


def test_load_sampler_presets():
    """Test loading sampler presets from JSON."""
    presets = load_sampler_presets()
    assert "Default - DPM++ 2M" in presets
    assert presets["Default - DPM++ 2M"]["sampler"] == "dpmpp_2m"
    assert presets["Default - DPM++ 2M"]["scheduler"] == "karras"


def test_load_styles():
    """Test loading built-in styles."""
    styles = load_styles()
    assert len(styles) > 0
    # Check flux style exists
    flux_style = next((s for s in styles if s["name"] == "Flux"), None)
    assert flux_style is not None
    assert flux_style["id"] == "built-in/flux.json"
    assert "checkpoints" in flux_style


def test_resolve_sampler_known():
    """Test resolving a known sampler preset."""
    sampler, scheduler = resolve_sampler("Flux - Euler simple")
    assert sampler == "euler"
    assert scheduler == "simple"


def test_resolve_sampler_unknown():
    """Test resolving an unknown sampler preset falls back to defaults."""
    sampler, scheduler = resolve_sampler("Unknown Preset")
    assert sampler == "euler"
    assert scheduler == "normal"
