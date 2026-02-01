"""Tests for upscaler module."""
import pytest
from src.core.upscaler import build_upscale_workflow, DEFAULT_UPSCALE_MODEL


def test_build_upscale_workflow_4x():
    """Test building 4x upscale workflow."""
    workflow = build_upscale_workflow(
        image_filename="test.png",
        factor=4.0,
    )
    # Should have 4 nodes: LoadImage, UpscaleModelLoader, ImageUpscaleWithModel, SaveImage
    assert len(workflow) == 4
    assert workflow["1"]["class_type"] == "LoadImage"
    assert workflow["2"]["class_type"] == "UpscaleModelLoader"
    assert workflow["3"]["class_type"] == "ImageUpscaleWithModel"
    assert workflow["4"]["class_type"] == "SaveImage"


def test_build_upscale_workflow_2x():
    """Test building 2x upscale workflow adds ImageScale node."""
    workflow = build_upscale_workflow(
        image_filename="test.png",
        factor=2.0,
    )
    # Should have 5 nodes: LoadImage, UpscaleModelLoader, ImageUpscaleWithModel, ImageScale, SaveImage
    assert len(workflow) == 5
    assert workflow["4"]["class_type"] == "ImageScale"
    assert workflow["4"]["inputs"]["width"] == 0  # Will be computed
    assert workflow["4"]["inputs"]["height"] == 0
    assert workflow["5"]["class_type"] == "SaveImage"


def test_build_upscale_workflow_custom_model():
    """Test using custom upscale model."""
    workflow = build_upscale_workflow(
        image_filename="test.png",
        factor=4.0,
        model="RealESRGAN_x4plus.pth",
    )
    assert workflow["2"]["inputs"]["model_name"] == "RealESRGAN_x4plus.pth"


def test_default_upscale_model():
    """Test default model is set."""
    assert DEFAULT_UPSCALE_MODEL == "4x-UltraSharp.pth"
