"""Tests for request handlers."""
import pytest
from src.core.handlers import handle_get_styles, handle_upscale, UpscaleParams


@pytest.mark.asyncio
async def test_handle_upscale_not_connected():
    """Test upscale fails when not connected."""
    params = UpscaleParams(image="base64data", factor=2.0)
    resp = await handle_upscale(params)
    assert resp.status == 503
    assert "Not connected" in resp.data["error"]


@pytest.mark.asyncio
async def test_handle_upscale_invalid_factor():
    """Test upscale fails with invalid factor."""
    params = UpscaleParams(image="base64data", factor=3.0)
    resp = await handle_upscale(params)
    assert resp.status == 400
    assert "Factor must be 2.0 or 4.0" in resp.data["error"]


@pytest.mark.asyncio
async def test_handle_get_styles():
    """Test GET /styles handler returns style list."""
    resp = await handle_get_styles()
    assert resp.status == 200
    assert "styles" in resp.data
    styles = resp.data["styles"]
    assert len(styles) > 0

    # Check structure
    first_style = styles[0]
    assert "id" in first_style
    assert "name" in first_style
    assert "sampler" in first_style
    assert "checkpoints" in first_style
