import pytest
from httpx import AsyncClient, ASGITransport
from src.fastapi_app import app


@pytest.mark.asyncio
async def test_connection_status_disconnected():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/connection")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "disconnected"
    assert "backend" in data
