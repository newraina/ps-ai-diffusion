"""Framework-agnostic request handlers for the Bridge API.

These handlers contain pure business logic without any framework-specific code.
They can be used by both FastAPI and aiohttp (ComfyUI extension).
"""
import os
import base64
from dataclasses import dataclass, asdict
from typing import Optional

from .state import state, ConnectionStatus, BackendType
from .comfy_client_manager import get_manager, JobStatus
from .cloud_client_manager import cloud_manager
from .cloud_types import CloudJobStatus
from .styles import load_styles, get_style_summary
from .upscaler import build_upscale_workflow, DEFAULT_UPSCALE_MODEL, MAX_INPUT_SIZE


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
    image: Optional[str] = None  # Base64 PNG for img2img
    strength: float = 1.0  # Denoise strength (1.0 = full, 0.0 = none)


@dataclass
class UpscaleParams:
    """Parameters for image upscaling."""
    image: str  # Base64 encoded PNG
    factor: float = 2.0
    model: str = ""


def get_comfy_url(request_url: Optional[str]) -> str:
    """Get ComfyUI URL with fallback to env var and default."""
    if request_url:
        return request_url
    return os.getenv("COMFY_URL", DEFAULT_COMFY_URL)


async def handle_health() -> ApiResponse:
    """Handle health check request."""
    return ApiResponse(data={"status": "ok"})


# === Cloud Authentication Handlers ===


async def handle_auth_sign_in() -> ApiResponse:
    """Start cloud service sign-in flow.

    Returns:
        ApiResponse with sign_in_url for user to visit in browser.
    """
    try:
        state.backend_type = BackendType.cloud
        state.connection_status = ConnectionStatus.auth_pending
        sign_in_url = await cloud_manager.sign_in_start()
        return ApiResponse(data={
            "sign_in_url": sign_in_url,
            "status": "pending",
        })
    except Exception as e:
        state.connection_status = ConnectionStatus.error
        state.error_message = str(e)
        return ApiResponse(data={"error": str(e)}, status=500)


async def handle_auth_confirm() -> ApiResponse:
    """Check if sign-in is complete.

    Returns:
        ApiResponse with status (pending or authorized) and token/user if authorized.
    """
    try:
        result = await cloud_manager.sign_in_confirm()
        if result is None:
            return ApiResponse(data={"status": "pending"})

        token, user = result
        state.connection_status = ConnectionStatus.connected
        state.cloud_user = user
        state.cloud_token = token
        state.error_message = None

        return ApiResponse(data={
            "status": "authorized",
            "token": token,
            "user": asdict(user),
        })
    except TimeoutError as e:
        state.connection_status = ConnectionStatus.error
        state.error_message = str(e)
        return ApiResponse(data={"error": str(e), "status": "timeout"}, status=408)
    except Exception as e:
        state.connection_status = ConnectionStatus.error
        state.error_message = str(e)
        return ApiResponse(data={"error": str(e), "status": "error"}, status=500)


async def handle_auth_validate(token: str) -> ApiResponse:
    """Validate an existing token.

    Args:
        token: Access token to validate

    Returns:
        ApiResponse with valid status and user info if valid.
    """
    if not token:
        return ApiResponse(data={"valid": False, "error": "Token is required"}, status=400)

    try:
        user = await cloud_manager.authenticate(token)
        state.backend_type = BackendType.cloud
        state.connection_status = ConnectionStatus.connected
        state.cloud_user = user
        state.cloud_token = token
        state.error_message = None

        return ApiResponse(data={
            "valid": True,
            "user": asdict(user),
        })
    except Exception as e:
        return ApiResponse(data={
            "valid": False,
            "error": str(e),
        })


async def handle_get_connection() -> ApiResponse:
    """Handle get connection status request."""
    if state.backend_type == BackendType.cloud:
        # Get cloud models list
        cloud_models = cloud_manager.models
        checkpoints = []
        if isinstance(cloud_models, dict) and "checkpoints" in cloud_models:
            checkpoints = list(cloud_models["checkpoints"].keys())

        return ApiResponse(data={
            "status": state.connection_status.value,
            "backend": state.backend_type.value,
            "comfy_url": state.comfy_url,
            "error": state.error_message,
            "connected": cloud_manager.is_connected,
            "user": asdict(state.cloud_user) if state.cloud_user else None,
            "models": checkpoints,
        })
    else:
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
    if backend == "cloud":
        state.backend_type = BackendType.cloud

        if not auth_token:
            # No token provided, user needs to sign in first
            state.connection_status = ConnectionStatus.disconnected
            return ApiResponse(data={
                "status": state.connection_status.value,
                "backend": state.backend_type.value,
                "comfy_url": state.comfy_url,
                "error": "Cloud service requires authentication. Use /api/auth/sign-in first.",
            })

        # Try to authenticate with provided token
        state.connection_status = ConnectionStatus.connecting
        try:
            user = await cloud_manager.authenticate(auth_token)
            state.connection_status = ConnectionStatus.connected
            state.cloud_user = user
            state.cloud_token = auth_token
            state.error_message = None
            return ApiResponse(data={
                "status": state.connection_status.value,
                "backend": state.backend_type.value,
                "comfy_url": state.comfy_url,
                "error": state.error_message,
                "user": asdict(user),
            })
        except Exception as e:
            state.connection_status = ConnectionStatus.error
            state.error_message = str(e)
            return ApiResponse(data={
                "status": state.connection_status.value,
                "backend": state.backend_type.value,
                "comfy_url": state.comfy_url,
                "error": state.error_message,
            })
    else:
        # Local ComfyUI connection
        manager = get_manager()
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
    if state.backend_type == BackendType.cloud:
        return await _handle_generate_cloud(params)
    else:
        return await _handle_generate_local(params)


async def _handle_generate_local(params: GenerateParams) -> ApiResponse:
    """Handle generate request for local ComfyUI backend."""
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
            image=params.image,
            strength=params.strength,
        )
        return ApiResponse(data={"job_id": job_id, "status": "queued"})
    except Exception as e:
        return ApiResponse(data={"error": str(e)}, status=500)


async def _handle_generate_cloud(params: GenerateParams) -> ApiResponse:
    """Handle generate request for cloud backend."""
    if not cloud_manager.is_connected:
        return ApiResponse(
            data={"error": "Not connected to cloud service"},
            status=503
        )

    try:
        # Build WorkflowInput from GenerateParams
        work = _build_workflow_input(params)
        job_id = await cloud_manager.enqueue(work)
        return ApiResponse(data={"job_id": job_id, "status": "queued"})
    except Exception as e:
        return ApiResponse(data={"error": str(e)}, status=500)


def _build_workflow_input(params: GenerateParams):
    """Convert GenerateParams to WorkflowInput for cloud backend."""
    import src.path_setup  # noqa: F401
    from shared.api import (
        WorkflowInput,
        WorkflowKind,
        ImageInput,
        ExtentInput,
        SamplingInput,
        ConditioningInput,
        CheckpointInput,
    )
    from shared.image import Extent

    # Determine workflow kind
    if params.image and params.strength < 1.0:
        kind = WorkflowKind.refine
    else:
        kind = WorkflowKind.generate

    # Build conditioning
    conditioning = ConditioningInput(
        positive=params.prompt,
        negative=params.negative_prompt,
    )

    # Build sampling
    import random
    seed = params.seed if params.seed >= 0 else random.randint(0, 2**31 - 1)
    sampling = SamplingInput(
        sampler=params.sampler,
        scheduler=params.scheduler,
        cfg_scale=params.cfg_scale,
        total_steps=params.steps,
        start_step=0 if params.strength >= 1.0 else int(params.steps * (1 - params.strength)),
        seed=seed,
    )

    # Build models
    models = CheckpointInput(checkpoint=params.model) if params.model else None

    # Build extent
    extent = Extent(params.width, params.height)
    extent_input = ExtentInput(
        input=extent,
        initial=extent,
        desired=extent,
        target=extent,
    )

    # Build image input if provided
    images = ImageInput(extent=extent_input)
    if params.image:
        from shared.image import Image
        image_bytes = base64.b64decode(params.image)
        initial_image = Image.from_bytes(image_bytes)
        images = ImageInput(
            extent=extent_input,
            initial_image=initial_image,
        )

    return WorkflowInput(
        kind=kind,
        conditioning=conditioning,
        sampling=sampling,
        models=models,
        batch_count=params.batch_size,
        images=images,
    )


async def handle_get_job(job_id: str) -> ApiResponse:
    """Handle get job status request.

    Returns:
        ApiResponse with job status, or error with status 404.
    """
    if state.backend_type == BackendType.cloud:
        job = cloud_manager.get_job(job_id)
        if not job:
            return ApiResponse(data={"error": "Job not found"}, status=404)

        return ApiResponse(data={
            "job_id": job_id,
            "status": job.status.value,
            "progress": job.progress,
            "error": job.error,
            "image_count": len(job.images),
        })
    else:
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
    if state.backend_type == BackendType.cloud:
        job = cloud_manager.get_job(job_id)
        if not job:
            return ApiResponse(data={"error": "Job not found"}, status=404)

        if job.status != CloudJobStatus.finished:
            return ApiResponse(
                data={"error": f"Job not finished (status: {job.status.value})"},
                status=400
            )

        if not job.images:
            return ApiResponse(data={"error": "No images available"}, status=404)

        # Convert to base64
        images_b64 = [base64.b64encode(img).decode("utf-8") for img in job.images]

        # Cloud jobs don't track seed, return 0 for each
        seeds = [0 for _ in range(len(job.images))]

        return ApiResponse(data={
            "job_id": job_id,
            "images": images_b64,
            "seeds": seeds,
        })
    else:
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
    if state.backend_type == BackendType.cloud:
        job = cloud_manager.get_job(job_id)
        if not job:
            return ApiResponse(data={"error": "Job not found"}, status=404)

        if job.status != CloudJobStatus.finished:
            return ApiResponse(
                data={"error": f"Job not finished (status: {job.status.value})"},
                status=400
            )

        if index < 0 or index >= len(job.images):
            return ApiResponse(data={"error": "Image index out of range"}, status=404)

        return (job.images[index], "image/png")
    else:
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
    if state.backend_type == BackendType.cloud:
        if not cloud_manager.is_connected:
            return ApiResponse(
                data={"error": "Not connected to cloud service"},
                status=503
            )

        job = cloud_manager.get_job(job_id)
        if not job:
            return ApiResponse(data={"error": "Job not found"}, status=404)

        success = await cloud_manager.cancel(job_id)
        return ApiResponse(data={"job_id": job_id, "cancelled": success})
    else:
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
    import logging
    logger = logging.getLogger(__name__)

    styles = load_styles()

    # For cloud backend, filter checkpoints to only include cloud-supported models
    if state.backend_type == BackendType.cloud:
        cloud_models = cloud_manager.models
        cloud_checkpoints = set()
        if isinstance(cloud_models, dict) and "checkpoints" in cloud_models:
            cloud_checkpoints = set(cloud_models["checkpoints"].keys())

        logger.info(f"[Cloud] Available checkpoints: {list(cloud_checkpoints)[:10]}...")

        filtered_styles = []
        for style in styles:
            summary = get_style_summary(style)
            # Filter checkpoints to only include cloud-supported ones
            original_checkpoints = summary.get("checkpoints", [])
            filtered_checkpoints = [cp for cp in original_checkpoints if cp in cloud_checkpoints]
            logger.info(f"[Cloud] Style '{summary['name']}': {original_checkpoints} -> {filtered_checkpoints}")
            # Only include style if it has at least one supported checkpoint
            if filtered_checkpoints:
                summary["checkpoints"] = filtered_checkpoints
                filtered_styles.append(summary)
        return ApiResponse(data={"styles": filtered_styles})
    else:
        summaries = [get_style_summary(s) for s in styles]
        return ApiResponse(data={"styles": summaries})


async def handle_upscale(params: UpscaleParams) -> ApiResponse:
    """Handle upscale request.

    Returns:
        ApiResponse with job_id and status, or error with status 400/503/500.
    """
    # Validate factor first (client error takes priority)
    if params.factor not in (2.0, 4.0):
        return ApiResponse(
            data={"error": "Factor must be 2.0 or 4.0"},
            status=400
        )

    manager = get_manager()

    if not manager.is_connected:
        return ApiResponse(
            data={"error": "Not connected to ComfyUI"},
            status=503
        )

    try:
        job_id = await manager.enqueue_upscale(
            image_base64=params.image,
            factor=params.factor,
            model=params.model,
        )
        return ApiResponse(data={"job_id": job_id, "status": "queued"})
    except Exception as e:
        return ApiResponse(data={"error": str(e)}, status=500)
