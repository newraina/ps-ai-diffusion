import os
import base64
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional

from src.state import state, ConnectionStatus, BackendType
from src.comfy_client_manager import get_manager, JobStatus


DEFAULT_COMFY_URL = "http://localhost:8188"


def get_comfy_url(request_url: Optional[str]) -> str:
    """Get ComfyUI URL with fallback to env var and default."""
    if request_url:
        return request_url
    return os.getenv("COMFY_URL", DEFAULT_COMFY_URL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    yield
    # Cleanup on shutdown
    manager = get_manager()
    if manager.is_connected:
        await manager.disconnect()


app = FastAPI(title="PS AI Bridge", version="0.1.0", lifespan=lifespan)


# Request/Response Models

class ConnectionRequest(BaseModel):
    backend: str = "local"
    comfy_url: Optional[str] = None
    auth_token: Optional[str] = None


class GenerateRequest(BaseModel):
    prompt: str
    negative_prompt: str = ""
    width: int = 512
    height: int = 512
    steps: int = 20
    cfg_scale: float = 7.0
    seed: int = -1
    model: str = ""
    batch_size: int = 1


class GenerateResponse(BaseModel):
    job_id: str
    status: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    progress: float
    error: Optional[str] = None
    image_count: int = 0


class JobImagesResponse(BaseModel):
    job_id: str
    images: list[str]  # Base64 encoded PNG images
    seeds: list[int]  # Seed used for each image


# Health & Connection Endpoints

@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/connection")
async def get_connection():
    manager = get_manager()
    return {
        "status": state.connection_status.value,
        "backend": state.backend_type.value,
        "comfy_url": state.comfy_url,
        "error": state.error_message,
        "connected": manager.is_connected,
    }


@app.post("/api/connection")
async def post_connection(request: ConnectionRequest):
    manager = get_manager()

    if request.backend == "local":
        state.backend_type = BackendType.local
        url = get_comfy_url(request.comfy_url)
        state.comfy_url = url
        state.connection_status = ConnectionStatus.connecting

        try:
            await manager.connect(url, request.auth_token)
            state.connection_status = ConnectionStatus.connected
            state.error_message = None
        except Exception as e:
            state.connection_status = ConnectionStatus.error
            state.error_message = str(e)
    else:
        state.backend_type = BackendType.cloud
        # Cloud connection to be implemented later

    return {
        "status": state.connection_status.value,
        "backend": state.backend_type.value,
        "comfy_url": state.comfy_url,
        "error": state.error_message,
    }


# Generation Endpoints

@app.post("/api/generate", response_model=GenerateResponse)
async def generate(request: GenerateRequest):
    """Submit a generation job."""
    manager = get_manager()

    if not manager.is_connected:
        raise HTTPException(status_code=503, detail="Not connected to ComfyUI")

    try:
        job_id = await manager.enqueue(
            prompt=request.prompt,
            negative_prompt=request.negative_prompt,
            width=request.width,
            height=request.height,
            steps=request.steps,
            cfg_scale=request.cfg_scale,
            seed=request.seed,
            checkpoint=request.model,
            batch_size=request.batch_size,
        )
        return GenerateResponse(job_id=job_id, status="queued")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """Get the status of a generation job."""
    manager = get_manager()
    job = manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return JobStatusResponse(
        job_id=job_id,
        status=job.status.value,
        progress=job.progress,
        error=job.error,
        image_count=len(job.images),
    )


@app.get("/api/jobs/{job_id}/images", response_model=JobImagesResponse)
async def get_job_images(job_id: str):
    """Get the generated images for a job (base64 encoded)."""
    manager = get_manager()
    job = manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status != JobStatus.finished:
        raise HTTPException(
            status_code=400,
            detail=f"Job not finished (status: {job.status.value})"
        )

    if not job.images:
        raise HTTPException(status_code=404, detail="No images available")

    # Convert to base64
    images_b64 = [base64.b64encode(img).decode("utf-8") for img in job.images]

    # Calculate seed for each image (seed + index)
    seeds = [job.seed + i for i in range(len(job.images))]

    return JobImagesResponse(job_id=job_id, images=images_b64, seeds=seeds)


@app.get("/api/jobs/{job_id}/images/{index}")
async def get_job_image(job_id: str, index: int):
    """Get a specific generated image as binary PNG."""
    manager = get_manager()
    job = manager.get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status != JobStatus.finished:
        raise HTTPException(
            status_code=400,
            detail=f"Job not finished (status: {job.status.value})"
        )

    if index < 0 or index >= len(job.images):
        raise HTTPException(status_code=404, detail="Image index out of range")

    return Response(
        content=job.images[index],
        media_type="image/png"
    )


@app.post("/api/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    """Cancel a generation job."""
    manager = get_manager()

    if not manager.is_connected:
        raise HTTPException(status_code=503, detail="Not connected to ComfyUI")

    job = manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    success = await manager.cancel(job_id)

    return {"job_id": job_id, "cancelled": success}
