"""FastAPI application for the PS AI Diffusion Bridge.

This module provides REST API endpoints for the standalone FastAPI service (port 7860).
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional

from src.core import get_manager
from src.core.handlers import (
    ApiResponse,
    GenerateParams,
    handle_health,
    handle_get_connection,
    handle_post_connection,
    handle_generate,
    handle_get_job,
    handle_get_job_images,
    handle_get_job_image,
    handle_cancel_job,
    handle_get_styles,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    yield
    # Cleanup on shutdown
    manager = get_manager()
    if manager.is_connected:
        await manager.disconnect()


app = FastAPI(title="PS AI Bridge", version="0.1.0", lifespan=lifespan)


# Request/Response Models (Pydantic for FastAPI validation)

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
    sampler: str = "euler"
    scheduler: str = "normal"


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
    resp = await handle_health()
    return resp.data


@app.get("/api/connection")
async def get_connection():
    resp = await handle_get_connection()
    return resp.data


@app.post("/api/connection")
async def post_connection(request: ConnectionRequest):
    resp = await handle_post_connection(
        backend=request.backend,
        comfy_url=request.comfy_url,
        auth_token=request.auth_token,
    )
    return resp.data


# Generation Endpoints

@app.post("/api/generate", response_model=GenerateResponse)
async def generate(request: GenerateRequest):
    """Submit a generation job."""
    params = GenerateParams(
        prompt=request.prompt,
        negative_prompt=request.negative_prompt,
        width=request.width,
        height=request.height,
        steps=request.steps,
        cfg_scale=request.cfg_scale,
        seed=request.seed,
        model=request.model,
        batch_size=request.batch_size,
        sampler=request.sampler,
        scheduler=request.scheduler,
    )
    resp = await handle_generate(params)
    if resp.status != 200:
        raise HTTPException(status_code=resp.status, detail=resp.data.get("error"))
    return resp.data


@app.get("/api/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """Get the status of a generation job."""
    resp = await handle_get_job(job_id)
    if resp.status != 200:
        raise HTTPException(status_code=resp.status, detail=resp.data.get("error"))
    return resp.data


@app.get("/api/jobs/{job_id}/images", response_model=JobImagesResponse)
async def get_job_images(job_id: str):
    """Get the generated images for a job (base64 encoded)."""
    resp = await handle_get_job_images(job_id)
    if resp.status != 200:
        raise HTTPException(status_code=resp.status, detail=resp.data.get("error"))
    return resp.data


@app.get("/api/jobs/{job_id}/images/{index}")
async def get_job_image(job_id: str, index: int):
    """Get a specific generated image as binary PNG."""
    result = await handle_get_job_image(job_id, index)
    if isinstance(result, ApiResponse):
        raise HTTPException(status_code=result.status, detail=result.data.get("error"))
    image_data, media_type = result
    return Response(content=image_data, media_type=media_type)


@app.post("/api/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    """Cancel a generation job."""
    resp = await handle_cancel_job(job_id)
    if resp.status != 200:
        raise HTTPException(status_code=resp.status, detail=resp.data.get("error"))
    return resp.data


# Styles Endpoints

@app.get("/api/styles")
async def get_styles():
    """Get available styles."""
    resp = await handle_get_styles()
    return resp.data
