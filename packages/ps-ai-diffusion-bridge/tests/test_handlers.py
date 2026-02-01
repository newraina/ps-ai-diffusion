"""Tests for request handlers."""
import pytest
from src.core.handlers import handle_get_styles


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
