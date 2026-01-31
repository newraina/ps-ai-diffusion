import pytest
from httpx import AsyncClient, ASGITransport
from src.main import app


@pytest.mark.asyncio
async def test_generate_requires_connection():
    """Test that generate returns 503 when not connected to ComfyUI."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/generate", json={
            "prompt": "a cat sitting on a chair",
            "width": 512,
            "height": 512,
        })

    assert response.status_code == 503
    data = response.json()
    assert "detail" in data
    assert "Not connected" in data["detail"]


@pytest.mark.asyncio
async def test_job_status_not_found():
    """Test that job status returns 404 for unknown job."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/jobs/nonexistent-job-id")

    assert response.status_code == 404
    data = response.json()
    assert "detail" in data
    assert "not found" in data["detail"].lower()


@pytest.mark.asyncio
async def test_job_images_not_found():
    """Test that job images returns 404 for unknown job."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/jobs/nonexistent-job-id/images")

    assert response.status_code == 404
