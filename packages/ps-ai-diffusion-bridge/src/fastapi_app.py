"""FastAPI application for the PS AI Diffusion Bridge.

This module provides REST API endpoints for the standalone FastAPI service (port 7860).
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional

from src.core import get_manager
from src.core.handlers import (
    ApiResponse,
    GenerateParams,
    UpscaleParams,
    handle_health,
    handle_get_connection,
    handle_get_diagnostics,
    handle_post_connection,
    handle_generate,
    handle_get_job,
    handle_get_job_images,
    handle_get_job_image,
    handle_cancel_job,
    handle_get_styles,
    handle_upscale,
    handle_custom_workflow,
    handle_auth_sign_in,
    handle_auth_confirm,
    handle_auth_validate,
)
from src.core.cloud_client_manager import cloud_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    yield
    # Cleanup on shutdown
    manager = get_manager()
    if manager.is_connected:
        await manager.disconnect()
    if cloud_manager.is_connected:
        await cloud_manager.disconnect()


app = FastAPI(title="PS AI Bridge", version="0.1.0", lifespan=lifespan)

# Enable CORS for UXP plugin access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response Models (Pydantic for FastAPI validation)

class ConnectionRequest(BaseModel):
    backend: str = "local"
    comfy_url: Optional[str] = None
    auth_token: Optional[str] = None


class LoraRequest(BaseModel):
    """Optional LoRA payload for cloud service.

    Notes:
        data is optional; if omitted, LoRA is treated as a reference-only name.
    """

    name: str
    strength: float = 1.0
    data: Optional[str] = None  # base64-encoded safetensors bytes


class ControlRequest(BaseModel):
    mode: str
    image: Optional[str] = None  # base64 PNG
    strength: float = 1.0
    range: Optional[list[float]] = None  # [start, end]


class RegionRequest(BaseModel):
    positive: str = ""
    mask: str  # base64 PNG mask
    bounds: Optional[dict] = None  # {x,y,width,height}
    control: list[ControlRequest] = []
    loras: list[LoraRequest] = []


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
    image: Optional[str] = None  # Base64 encoded PNG
    strength: float = 1.0  # 0.0-1.0 (img2img / refine)
    mask: Optional[str] = None  # Base64 encoded PNG mask (inpaint/refine_region)
    # Inpaint parameters (best-effort mapping to shared.api.InpaintParams)
    inpaint_mode: str = "automatic"
    inpaint_fill: str = "neutral"
    inpaint_context: str = "automatic"
    inpaint_padding: int = 0
    inpaint_grow: int = 0
    inpaint_feather: int = 0
    loras: list[LoraRequest] = []
    control: list[ControlRequest] = []
    regions: list[RegionRequest] = []


class GenerateResponse(BaseModel):
    job_id: str
    status: str


class UpscaleRequest(BaseModel):
    image: str  # Base64 encoded PNG
    factor: float = 2.0
    model: str = ""
    # Optional tiled diffusion refine after upscaling
    refine: bool = False
    checkpoint: str = ""
    prompt: str = ""
    negative_prompt: str = ""
    steps: int = 20
    cfg_scale: float = 7.0
    sampler: str = "euler"
    scheduler: str = "normal"
    seed: int = -1
    strength: float = 0.35
    tile_overlap: int = -1
    loras: list[LoraRequest] = []


class AuthValidateRequest(BaseModel):
    token: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    progress: float
    error: Optional[str] = None
    payment_required: Optional[dict] = None
    image_count: int = 0


class JobImagesResponse(BaseModel):
    job_id: str
    images: list[str]  # Base64 encoded PNG images
    seeds: list[int]  # Seed used for each image


# Custom workflow endpoints (local backend only)

class CustomWorkflowRequest(BaseModel):
    workflow: dict


# Health & Connection Endpoints

@app.get("/api/health")
async def health():
    resp = await handle_health()
    return resp.data


# Cloud Authentication Endpoints

@app.post("/api/auth/sign-in")
async def auth_sign_in():
    """Start cloud service sign-in flow.

    Returns a sign_in_url for the user to open in their browser.
    """
    resp = await handle_auth_sign_in()
    if resp.status != 200:
        raise HTTPException(status_code=resp.status, detail=resp.data.get("error"))
    return resp.data


@app.post("/api/auth/confirm")
async def auth_confirm():
    """Check if sign-in is complete.

    Call this endpoint repeatedly after sign-in to check authorization status.
    Returns status: "pending" if still waiting, or "authorized" with token and user info.
    """
    resp = await handle_auth_confirm()
    if resp.status not in (200, 408):
        raise HTTPException(status_code=resp.status, detail=resp.data.get("error"))
    return resp.data


@app.post("/api/auth/validate")
async def auth_validate(request: AuthValidateRequest):
    """Validate an existing access token.

    Use this to restore a previously saved session.
    """
    resp = await handle_auth_validate(request.token)
    if resp.status != 200:
        raise HTTPException(status_code=resp.status, detail=resp.data.get("error"))
    return resp.data


@app.get("/api/connection")
async def get_connection():
    resp = await handle_get_connection()
    return resp.data


@app.get("/api/diagnostics")
async def get_diagnostics():
    resp = await handle_get_diagnostics()
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
        image=request.image,
        strength=request.strength,
        mask=request.mask,
        inpaint_mode=request.inpaint_mode,
        inpaint_fill=request.inpaint_fill,
        inpaint_context=request.inpaint_context,
        inpaint_padding=request.inpaint_padding,
        inpaint_grow=request.inpaint_grow,
        inpaint_feather=request.inpaint_feather,
        loras=[l.model_dump() for l in request.loras] if request.loras else [],
        control=[c.model_dump() for c in request.control] if request.control else [],
        regions=[r.model_dump() for r in request.regions] if request.regions else [],
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


# Upscale Endpoints

@app.post("/api/upscale", response_model=GenerateResponse)
async def upscale(request: UpscaleRequest):
    """Submit an upscale job."""
    params = UpscaleParams(
        image=request.image,
        factor=request.factor,
        model=request.model,
        refine=request.refine,
        checkpoint=request.checkpoint,
        prompt=request.prompt,
        negative_prompt=request.negative_prompt,
        steps=request.steps,
        cfg_scale=request.cfg_scale,
        sampler=request.sampler,
        scheduler=request.scheduler,
        seed=request.seed,
        strength=request.strength,
        tile_overlap=request.tile_overlap,
        loras=[l.model_dump() for l in request.loras] if request.loras else [],
    )
    resp = await handle_upscale(params)
    if resp.status != 200:
        raise HTTPException(status_code=resp.status, detail=resp.data.get("error"))
    return resp.data


@app.post("/api/custom", response_model=GenerateResponse)
async def custom_workflow(request: CustomWorkflowRequest):
    """Submit a custom ComfyUI workflow graph (local backend only)."""
    resp = await handle_custom_workflow(request.workflow)
    if resp.status != 200:
        raise HTTPException(status_code=resp.status, detail=resp.data.get("error"))
    return resp.data


# Styles Endpoints

@app.get("/api/styles")
async def get_styles():
    """Get available styles."""
    resp = await handle_get_styles()
    return resp.data
