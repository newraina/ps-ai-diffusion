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


@pytest.mark.asyncio
async def test_enqueue_selects_img2img_workflow():
    """Test that enqueue uses img2img workflow when image and strength < 1.0 provided."""
    from unittest.mock import AsyncMock, patch, MagicMock
    from src.core.comfy_client_manager import ComfyClientManager

    manager = ComfyClientManager()
    manager._is_connected = True
    manager._session = MagicMock()

    # Mock _upload_image and post
    mock_upload = AsyncMock(return_value="uploaded.png")
    mock_post_response = AsyncMock()
    mock_post_response.status = 200
    mock_post_response.json = AsyncMock(return_value={"prompt_id": "test-job-id"})
    mock_post_response.__aenter__ = AsyncMock(return_value=mock_post_response)
    mock_post_response.__aexit__ = AsyncMock(return_value=None)
    manager._session.post = MagicMock(return_value=mock_post_response)

    with patch.object(manager, '_upload_image', mock_upload):
        job_id = await manager.enqueue(
            prompt="a cat",
            negative_prompt="",
            width=512,
            height=512,
            steps=20,
            cfg_scale=7.0,
            seed=42,
            checkpoint="model.safetensors",
            batch_size=1,
            sampler="euler",
            scheduler="normal",
            image="base64encodedimage",
            strength=0.7,
        )

    # Should have called _upload_image
    mock_upload.assert_called_once_with("base64encodedimage")

    # Check the workflow submitted has LoadImage node
    call_args = manager._session.post.call_args
    submitted_data = call_args.kwargs.get('json') or call_args[1].get('json')
    workflow = submitted_data['prompt']

    # Should have LoadImage (node 2 in img2img workflow)
    assert "2" in workflow
    assert workflow["2"]["class_type"] == "LoadImage"
