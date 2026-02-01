"""Tests for img2img workflow building."""
import pytest
from src.core.comfy_client_manager import build_img2img_workflow


def test_build_img2img_workflow_basic():
    """Test that img2img workflow has correct structure."""
    workflow, seed = build_img2img_workflow(
        image_filename="test.png",
        prompt="a cat",
        negative_prompt="bad quality",
        width=512,
        height=512,
        steps=20,
        cfg_scale=7.0,
        seed=42,
        checkpoint="model.safetensors",
        batch_size=1,
        sampler="euler",
        scheduler="normal",
        strength=0.7,
    )

    # Should have 8 nodes
    assert len(workflow) == 8

    # Should have LoadImage node
    load_image = workflow["2"]
    assert load_image["class_type"] == "LoadImage"
    assert load_image["inputs"]["image"] == "test.png"

    # Should have VAEEncode node
    vae_encode = workflow["3"]
    assert vae_encode["class_type"] == "VAEEncode"

    # KSampler should have correct start_at_step
    ksampler = workflow["6"]
    assert ksampler["class_type"] == "KSampler"
    # strength=0.7, steps=20 -> start_step = round(20 * 0.3) = 6
    assert ksampler["inputs"]["start_at_step"] == 6
    assert ksampler["inputs"]["end_at_step"] == 20


def test_build_img2img_workflow_strength_calculation():
    """Test that strength is correctly converted to start_step."""
    test_cases = [
        (1.0, 20, 0),   # Full denoise, start at 0
        (0.5, 20, 10),  # Half denoise, start at 10
        (0.7, 20, 6),   # 70% denoise, start at 6
        (0.3, 20, 14),  # 30% denoise, start at 14
        (0.0, 20, 20),  # No denoise, start at 20 (no change)
    ]

    for strength, steps, expected_start in test_cases:
        workflow, _ = build_img2img_workflow(
            image_filename="test.png",
            prompt="test",
            steps=steps,
            strength=strength,
        )
        ksampler = workflow["6"]
        actual_start = ksampler["inputs"]["start_at_step"]
        assert actual_start == expected_start, \
            f"strength={strength}, steps={steps}: expected start_at_step={expected_start}, got {actual_start}"
