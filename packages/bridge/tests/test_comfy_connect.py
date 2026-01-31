import pytest
from httpx import AsyncClient, ASGITransport
from src.main import app


@pytest.mark.asyncio
async def test_connect_to_comfy_updates_status():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/connection", json={
            "backend": "local",
            "comfy_url": "http://localhost:8188"
        })

    assert response.status_code == 200
    data = response.json()
    # If ComfyUI is not running, expect error status
    # If running, expect connected status
    assert data["status"] in ["connected", "error"]
