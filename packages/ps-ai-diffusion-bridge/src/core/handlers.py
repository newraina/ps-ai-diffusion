"""Framework-agnostic request handlers for the Bridge API.

These handlers contain pure business logic without any framework-specific code.
They can be used by both FastAPI and aiohttp (ComfyUI extension).
"""
import os
import base64
from dataclasses import dataclass
from typing import Optional

from .state import state, ConnectionStatus, BackendType
from .comfy_client_manager import get_manager, JobStatus
from .styles import load_styles, get_style_summary


DEFAULT_COMFY_URL = "http://localhost:8188"


@dataclass
class ApiResponse:
    """Standard API response wrapper."""
    data: dict
    status: int = 200


@dataclass
class GenerateParams:
    """Parameters for image generation."""
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


def get_comfy_url(request_url: Optional[str]) -> str:
    """Get ComfyUI URL with fallback to env var and default."""
    if request_url:
        return request_url
    return os.getenv("COMFY_URL", DEFAULT_COMFY_URL)


async def handle_health() -> ApiResponse:
    """Handle health check request."""
    return ApiResponse(data={"status": "ok"})


async def handle_get_connection() -> ApiResponse:
    """Handle get connection status request."""
    manager = get_manager()
    return ApiResponse(data={
        "status": state.connection_status.value,
        "backend": state.backend_type.value,
        "comfy_url": state.comfy_url,
        "error": state.error_message,
        "connected": manager.is_connected,
    })


async def handle_post_connection(
    backend: str = "local",
    comfy_url: Optional[str] = None,
    auth_token: Optional[str] = None,
) -> ApiResponse:
    """Handle post connection request."""
    manager = get_manager()

    if backend == "local":
        state.backend_type = BackendType.local
        url = get_comfy_url(comfy_url)
        state.comfy_url = url
        state.connection_status = ConnectionStatus.connecting

        try:
            await manager.connect(url, auth_token)
            state.connection_status = ConnectionStatus.connected
            state.error_message = None
        except Exception as e:
            state.connection_status = ConnectionStatus.error
            state.error_message = str(e)
    else:
        state.backend_type = BackendType.cloud
        # Cloud connection to be implemented later

    return ApiResponse(data={
        "status": state.connection_status.value,
        "backend": state.backend_type.value,
        "comfy_url": state.comfy_url,
        "error": state.error_message,
    })


async def handle_generate(params: GenerateParams) -> ApiResponse:
    """Handle generate request.

    Returns:
        ApiResponse with job_id and status, or error with status 503/500.
    """
    manager = get_manager()

    if not manager.is_connected:
        return ApiResponse(
            data={"error": "Not connected to ComfyUI"},
            status=503
        )

    try:
        job_id = await manager.enqueue(
            prompt=params.prompt,
            negative_prompt=params.negative_prompt,
            width=params.width,
            height=params.height,
            steps=params.steps,
            cfg_scale=params.cfg_scale,
            seed=params.seed,
            checkpoint=params.model,
            batch_size=params.batch_size,
            sampler=params.sampler,
            scheduler=params.scheduler,
        )
        return ApiResponse(data={"job_id": job_id, "status": "queued"})
    except Exception as e:
        return ApiResponse(data={"error": str(e)}, status=500)


async def handle_get_job(job_id: str) -> ApiResponse:
    """Handle get job status request.

    Returns:
        ApiResponse with job status, or error with status 404.
    """
    manager = get_manager()
    job = manager.get_job(job_id)

    if not job:
        return ApiResponse(data={"error": "Job not found"}, status=404)

    return ApiResponse(data={
        "job_id": job_id,
        "status": job.status.value,
        "progress": job.progress,
        "error": job.error,
        "image_count": len(job.images),
    })


async def handle_get_job_images(job_id: str) -> ApiResponse:
    """Handle get job images request (base64 encoded).

    Returns:
        ApiResponse with images array, or error with status 400/404.
    """
    manager = get_manager()
    job = manager.get_job(job_id)

    if not job:
        return ApiResponse(data={"error": "Job not found"}, status=404)

    if job.status != JobStatus.finished:
        return ApiResponse(
            data={"error": f"Job not finished (status: {job.status.value})"},
            status=400
        )

    if not job.images:
        return ApiResponse(data={"error": "No images available"}, status=404)

    # Convert to base64
    images_b64 = [base64.b64encode(img).decode("utf-8") for img in job.images]

    # Calculate seed for each image (seed + index)
    seeds = [job.seed + i for i in range(len(job.images))]

    return ApiResponse(data={
        "job_id": job_id,
        "images": images_b64,
        "seeds": seeds,
    })


async def handle_get_job_image(job_id: str, index: int) -> tuple[bytes, str] | ApiResponse:
    """Handle get single job image request (binary).

    Returns:
        tuple of (image_bytes, media_type) on success, or ApiResponse with error.
    """
    manager = get_manager()
    job = manager.get_job(job_id)

    if not job:
        return ApiResponse(data={"error": "Job not found"}, status=404)

    if job.status != JobStatus.finished:
        return ApiResponse(
            data={"error": f"Job not finished (status: {job.status.value})"},
            status=400
        )

    if index < 0 or index >= len(job.images):
        return ApiResponse(data={"error": "Image index out of range"}, status=404)

    return (job.images[index], "image/png")


async def handle_cancel_job(job_id: str) -> ApiResponse:
    """Handle cancel job request.

    Returns:
        ApiResponse with cancellation result, or error with status 404/503.
    """
    manager = get_manager()

    if not manager.is_connected:
        return ApiResponse(
            data={"error": "Not connected to ComfyUI"},
            status=503
        )

    job = manager.get_job(job_id)
    if not job:
        return ApiResponse(data={"error": "Job not found"}, status=404)

    success = await manager.cancel(job_id)

    return ApiResponse(data={"job_id": job_id, "cancelled": success})


async def handle_get_styles() -> ApiResponse:
    """Handle get styles request.

    Returns:
        ApiResponse with list of available styles.
    """
    styles = load_styles()
    summaries = [get_style_summary(s) for s in styles]
    return ApiResponse(data={"styles": summaries})
