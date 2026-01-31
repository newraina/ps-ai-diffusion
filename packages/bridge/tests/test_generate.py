import pytest
from httpx import AsyncClient, ASGITransport
from src.main import app


@pytest.mark.asyncio
async def test_generate_accepts_request():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/generate", json={
            "prompt": "a cat sitting on a chair",
            "width": 512,
            "height": 512,
        })

    assert response.status_code == 200
    data = response.json()
    assert "job_id" in data
