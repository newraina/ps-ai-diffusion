"""Framework-agnostic request handlers for the Bridge API.

These handlers contain pure business logic without any framework-specific code.
They can be used by both FastAPI and aiohttp (ComfyUI extension).
"""
import os
import base64
import re
from dataclasses import dataclass, asdict, field
from typing import Optional

from .state import state, ConnectionStatus, BackendType
from .comfy_client_manager import get_manager, JobStatus
from .cloud_client_manager import cloud_manager
from .cloud_types import CloudJobStatus
from .styles import load_styles, get_style_summary
from .upscaler import DEFAULT_UPSCALE_MODEL


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
    mask: Optional[str] = None  # Base64 PNG mask for inpaint/refine_region
    # Inpaint parameters (best-effort mapping to shared.api.InpaintParams).
    # These are applied when a mask is present.
    inpaint_mode: str = "automatic"
    inpaint_fill: str = "neutral"
    inpaint_context: str = "automatic"
    inpaint_padding: int = 0
    inpaint_grow: int = 0
    inpaint_feather: int = 0
    # Optional LoRAs. Each entry can contain:
    # - name: str (required)
    # - strength: float (optional, default 1.0)
    # - data: str (optional, base64-encoded safetensors bytes for upload)
    loras: list[dict] = field(default_factory=list)
    # Optional Control layers (ControlNet / IP-Adapter).
    # Each entry can contain:
    # - mode: str (shared.resources.ControlMode member name, e.g. "reference", "pose", "canny_edge")
    # - image: str (optional, base64 PNG)
    # - strength: float (optional)
    # - range: [float, float] (optional)
    control: list[dict] = field(default_factory=list)
    # Optional regions (for regional prompting/control).
    # Each entry can contain:
    # - positive: str
    # - mask: str (base64 PNG mask)
    # - bounds: optional {x,y,width,height} (if omitted, derived from mask non-zero bbox)
    # - control: optional list like GenerateParams.control
    # - loras: optional list like GenerateParams.loras (payload upload supported)
    regions: list[dict] = field(default_factory=list)
    # Optional performance settings (best-effort override for resolution)
    performance: dict | None = None


@dataclass
class UpscaleParams:
    """Parameters for image upscaling."""
    image: str  # Base64 encoded PNG
    factor: float = 2.0
    model: str = ""
    # Optional tiled diffusion refine after upscaling (Krita parity).
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
    loras: list[dict] = field(default_factory=list)


@dataclass
class ControlImageParams:
    """Parameters for control image preprocessing."""
    mode: str
    image: str
    bounds: Optional[dict] = None
    seed: int = -1
    performance: dict | None = None


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
            "web_url": cloud_manager.default_web_url,
            "account_url": f"{cloud_manager.default_web_url}/user",
            "buy_tokens_url": f"{cloud_manager.default_web_url}/checkout/tokens5000",
            "features": asdict(cloud_manager.features) if cloud_manager.features else None,
            "news": (
                {"text": cloud_manager.news.text, "digest": cloud_manager.news.digest}
                if cloud_manager.news
                else None
            ),
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


async def handle_get_diagnostics() -> ApiResponse:
    """Handle diagnostics request for local backend."""
    if state.backend_type == BackendType.cloud:
        return ApiResponse(data={
            "backend": state.backend_type.value,
            "connected": False,
            "missing_nodes": [],
            "missing_required_models": [],
            "missing_optional_models": [],
            "error": "Diagnostics only available for local backend",
        })

    manager = get_manager()
    diagnostics = await manager.get_diagnostics()
    diagnostics["backend"] = state.backend_type.value
    return ApiResponse(data=diagnostics)


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
        work, _ = _build_workflow_input(params)
        job_id = await manager.enqueue_workflow(
            work,
            batch_size=params.batch_size,
            seed=work.sampling.seed if work.sampling else 0,
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
        work, lora_payloads = _build_workflow_input(params)
        job_id = await cloud_manager.enqueue(work, lora_payloads=lora_payloads)
        return ApiResponse(data={"job_id": job_id, "status": "queued"})
    except Exception as e:
        return ApiResponse(data={"error": str(e)}, status=500)


_pattern_lora_tag = re.compile(r"<lora:([^:<>]+)(?::(-?[^:<>]*))?>", re.IGNORECASE)


def _parse_lora_tags(prompt: str) -> tuple[str, list[tuple[str, float]]]:
    """Parse and strip <lora:name:weight> tags from prompt.

    Returns:
        (clean_prompt, [(name, strength), ...])
    """
    loras: list[tuple[str, float]] = []

    def replace(match: re.Match[str]) -> str:
        name = (match[1] or "").strip()
        strength = 1.0
        if match[2]:
            try:
                strength = float(match[2])
            except ValueError:
                strength = 1.0
        if name:
            loras.append((name, strength))
        return ""

    cleaned = _pattern_lora_tag.sub(replace, prompt)
    return cleaned.strip(), loras


def _mask_bounds_from_grayscale_bytes(data: bytes, width: int, height: int) -> tuple[int, int, int, int] | None:
    """Compute bounding box of non-zero pixels in a grayscale mask.

    Returns:
        (x, y, w, h) in image coordinates, or None if mask is empty.
    """
    if width <= 0 or height <= 0:
        return None

    min_x, min_y = width, height
    max_x, max_y = -1, -1

    idx = 0
    for y in range(height):
        row_has = False
        row_min_x = width
        row_max_x = -1
        for x in range(width):
            if data[idx] != 0:
                row_has = True
                if x < row_min_x:
                    row_min_x = x
                if x > row_max_x:
                    row_max_x = x
            idx += 1
        if row_has:
            if y < min_y:
                min_y = y
            if y > max_y:
                max_y = y
            if row_min_x < min_x:
                min_x = row_min_x
            if row_max_x > max_x:
                max_x = row_max_x

    if max_x < min_x or max_y < min_y:
        return None

    return (min_x, min_y, (max_x - min_x + 1), (max_y - min_y + 1))


def _build_workflow_input(params: GenerateParams):
    """Convert GenerateParams to (WorkflowInput, lora_payloads) for cloud backend."""
    import src.path_setup  # noqa: F401
    from shared.api import (
        WorkflowInput,
        WorkflowKind,
        ImageInput,
        ExtentInput,
        SamplingInput,
        ConditioningInput,
        CheckpointInput,
        LoraInput,
        ControlInput,
        RegionInput,
        InpaintParams,
        InpaintMode,
        InpaintContext,
        FillMode,
    )
    from shared.image import Extent, Bounds, Image
    from shared.resources import ControlMode
    from shared.settings import PerformanceSettings
    from shared import resolution

    # Parse LoRA tags (best-effort) from prompt.
    prompt_clean, lora_tags = _parse_lora_tags(params.prompt)
    negative_clean, _ = _parse_lora_tags(params.negative_prompt or "")

    # Determine workflow kind
    base_kind = WorkflowKind.generate
    if params.image and params.strength < 1.0:
        base_kind = WorkflowKind.refine

    kind = base_kind
    if params.mask:
        # Mirror upstream behavior: mask upgrades generate->inpaint, refine->refine_region
        kind = WorkflowKind.inpaint if base_kind is WorkflowKind.generate else WorkflowKind.refine_region

    # Build conditioning
    conditioning = ConditioningInput(
        positive=prompt_clean,
        negative=negative_clean,
    )

    def parse_control_list(items: list[dict]) -> list[ControlInput]:
        controls: list[ControlInput] = []
        for entry in items or []:
            try:
                mode_raw = str(entry.get("mode", "")).strip()
                if not mode_raw:
                    continue
                mode_key = mode_raw.lower()
                if mode_key not in ControlMode.__members__:
                    raise ValueError(f"Unknown control mode: {mode_raw}")
                mode = ControlMode[mode_key]

                strength = float(entry.get("strength", 1.0))
                r = entry.get("range")
                if isinstance(r, (list, tuple)) and len(r) == 2:
                    range_tuple = (float(r[0]), float(r[1]))
                else:
                    range_tuple = (
                        float(entry.get("range_start", 0.0)),
                        float(entry.get("range_end", 1.0)),
                    )

                img_b64 = entry.get("image")
                img = None
                if isinstance(img_b64, str) and img_b64:
                    if "," in img_b64:
                        img_b64 = img_b64.split(",", 1)[1]
                    img_bytes = base64.b64decode(img_b64)
                    img = Image.from_bytes(img_bytes)

                controls.append(
                    ControlInput(
                        mode=mode,
                        image=img,
                        strength=strength,
                        range=range_tuple,
                    )
                )
            except Exception:
                # Ignore malformed entries; request-level validation can be added later.
                continue
        return controls

    # Global control layers
    conditioning.control = parse_control_list(params.control)

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

    # Collect LoRAs from tags + request payloads
    loras: list[LoraInput] = []
    for name, strength in lora_tags:
        loras.append(LoraInput(name=name, strength=strength))

    # Optional LoRA payload uploads (base64 safetensors)
    lora_payloads: dict[str, tuple[str, bytes]] = {}
    for entry in (params.loras or []):
        try:
            name = str(entry.get("name", "")).strip()
            if not name:
                continue
            strength = float(entry.get("strength", 1.0))
            data_b64 = entry.get("data")
            if isinstance(data_b64, str) and data_b64:
                import hashlib
                import base64 as _b64

                raw = _b64.b64decode(data_b64)
                storage_id = _b64.b64encode(hashlib.sha256(raw).digest()).decode("utf-8")
                lora_payloads[name] = (storage_id, raw)
                loras.append(LoraInput(name=name, strength=strength, storage_id=storage_id))
            else:
                # Reference-only LoRA (assumed available in cloud)
                loras.append(LoraInput(name=name, strength=strength))
        except Exception:
            # Ignore malformed entries; request-level validation can be added later.
            continue

    # Regions (regional prompts/control/loras)
    regions: list[RegionInput] = []
    for region_entry in (params.regions or []):
        try:
            region_positive = str(region_entry.get("positive", "")).strip()
            region_prompt_clean, region_lora_tags = _parse_lora_tags(region_positive)

            mask_b64 = region_entry.get("mask")
            if not (isinstance(mask_b64, str) and mask_b64):
                continue
            if "," in mask_b64:
                mask_b64 = mask_b64.split(",", 1)[1]
            mask_bytes = base64.b64decode(mask_b64)
            region_mask = Image.from_bytes(mask_bytes)
            if not region_mask.is_mask:
                # Best-effort conversion to grayscale
                region_mask = region_mask.to_grayscale()

            bounds_data = region_entry.get("bounds")
            if isinstance(bounds_data, dict):
                bounds = Bounds(
                    int(bounds_data.get("x", 0)),
                    int(bounds_data.get("y", 0)),
                    int(bounds_data.get("width", region_mask.width)),
                    int(bounds_data.get("height", region_mask.height)),
                )
            else:
                bbox = _mask_bounds_from_grayscale_bytes(
                    bytes(region_mask.data), region_mask.width, region_mask.height
                )
                if bbox is None:
                    continue
                x, y, w, h = bbox
                bounds = Bounds(x, y, w, h)

            # Region control layers
            region_controls = parse_control_list(region_entry.get("control", []) or [])

            # Region loras: tags + payload list (optional)
            region_loras: list[LoraInput] = [LoraInput(name=n, strength=s) for n, s in region_lora_tags]
            for entry in (region_entry.get("loras", []) or []):
                try:
                    name = str(entry.get("name", "")).strip()
                    if not name:
                        continue
                    strength = float(entry.get("strength", 1.0))
                    data_b64 = entry.get("data")
                    if isinstance(data_b64, str) and data_b64:
                        import hashlib
                        import base64 as _b64

                        raw = _b64.b64decode(data_b64)
                        storage_id = _b64.b64encode(hashlib.sha256(raw).digest()).decode("utf-8")
                        lora_payloads[name] = (storage_id, raw)
                        region_loras.append(
                            LoraInput(name=name, strength=strength, storage_id=storage_id)
                        )
                    else:
                        region_loras.append(LoraInput(name=name, strength=strength))
                except Exception:
                    continue

            regions.append(
                RegionInput(
                    mask=region_mask,
                    bounds=bounds,
                    positive=region_prompt_clean,
                    control=region_controls,
                    loras=region_loras,
                )
            )
        except Exception:
            continue

    if regions:
        conditioning.regions = regions

    # Build models
    models = CheckpointInput(checkpoint=params.model, loras=loras) if params.model else None

    # Build extent
    extent = Extent(params.width, params.height)
    perf_settings = PerformanceSettings()
    perf_override = params.performance or {}
    try:
        if isinstance(perf_override, dict):
            max_pixels = perf_override.get("max_pixels")
            resolution_multiplier = perf_override.get("resolution_multiplier")
            if max_pixels is not None:
                perf_settings.max_pixel_count = max(0.0, float(max_pixels)) / 1_000_000
            if resolution_multiplier is not None:
                perf_settings.resolution_multiplier = float(resolution_multiplier)
    except Exception:
        pass

    if perf_settings.resolution_multiplier != 1.0 or perf_settings.max_pixel_count > 0:
        extent = resolution.apply_resolution_settings(extent, perf_settings)
        extent = Extent(int(extent.width), int(extent.height)).multiple_of(8)

    extent_input = ExtentInput(
        input=extent,
        initial=extent,
        desired=extent,
        target=extent,
    )

    # Build image input if provided
    images = ImageInput(extent=extent_input)
    inpaint = None
    crop_upscale_extent = None

    if params.image:
        image_b64 = params.image
        if "," in image_b64:
            image_b64 = image_b64.split(",", 1)[1]
        image_bytes = base64.b64decode(image_b64)
        initial_image = Image.from_bytes(image_bytes)
        images = ImageInput(extent=extent_input, initial_image=initial_image)

    if params.mask:
        if not params.image:
            raise ValueError("mask requires image input (inpaint/refine_region)")

        mask_b64 = params.mask
        if "," in mask_b64:
            mask_b64 = mask_b64.split(",", 1)[1]
        mask_bytes = base64.b64decode(mask_b64)
        mask_img = Image.from_bytes(mask_bytes)
        if not mask_img.is_mask:
            # Ensure grayscale mask
            mask_img = mask_img.to_grayscale()

        # Compute bounds from non-zero pixels.
        raw = bytes(mask_img.data)
        bbox = _mask_bounds_from_grayscale_bytes(raw, mask_img.width, mask_img.height)
        if bbox is None:
            raise ValueError("mask is empty")
        x, y, w, h = bbox
        mask_bounds = Bounds(x, y, w, h)

        images.hires_mask = mask_img

        # Build inpaint params (mode/fill/context + padding/grow/feather).
        # Defaults keep backwards-compatible behavior.
        mode_key = str(getattr(params, "inpaint_mode", "automatic") or "automatic").lower()
        if mode_key in InpaintMode.__members__:
            inpaint_mode = InpaintMode[mode_key]
        else:
            inpaint_mode = InpaintMode.automatic

        fill_key = str(getattr(params, "inpaint_fill", "neutral") or "neutral").lower()
        # For replace_background, default to FillMode.replace unless explicitly overridden.
        if inpaint_mode is InpaintMode.replace_background and fill_key == "neutral":
            fill_key = "replace"
        if fill_key in FillMode.__members__:
            inpaint_fill = FillMode[fill_key]
        else:
            inpaint_fill = FillMode.neutral

        ctx_key = str(getattr(params, "inpaint_context", "automatic") or "automatic").lower()
        if ctx_key in InpaintContext.__members__:
            inpaint_context = InpaintContext[ctx_key]
        else:
            inpaint_context = InpaintContext.automatic

        # Choose target bounds based on context.
        if inpaint_context is InpaintContext.entire_image:
            target_bounds = Bounds(0, 0, mask_img.width, mask_img.height)
        elif inpaint_context is InpaintContext.layer_bounds:
            # Layer bounds are not available in this bridge yet; fall back to mask bounds.
            target_bounds = mask_bounds
        else:
            target_bounds = mask_bounds

        # Apply additional padding around target bounds (document coordinates).
        try:
            pad = int(getattr(params, "inpaint_padding", 0) or 0)
        except Exception:
            pad = 0
        pad = max(0, pad)
        if pad > 0:
            target_bounds = Bounds.pad(target_bounds, pad, multiple=8)
            target_bounds = Bounds.clamp(target_bounds, Extent(mask_img.width, mask_img.height))

        try:
            grow = int(getattr(params, "inpaint_grow", 0) or 0)
        except Exception:
            grow = 0
        try:
            feather = int(getattr(params, "inpaint_feather", 0) or 0)
        except Exception:
            feather = 0

        inpaint = InpaintParams(
            mode=inpaint_mode,
            target_bounds=target_bounds,
            fill=inpaint_fill,
            grow=max(0, grow),
            feather=max(0, feather),
            blend=0,
        ).clamped()
        inpaint.use_inpaint_model = params.strength >= 0.95

        if kind is WorkflowKind.inpaint:
            crop_upscale_extent = target_bounds.extent

    return WorkflowInput(
        kind=kind,
        conditioning=conditioning,
        sampling=sampling,
        models=models,
        batch_count=params.batch_size,
        images=images,
        inpaint=inpaint,
        crop_upscale_extent=crop_upscale_extent,
    ), lora_payloads


async def handle_get_job(job_id: str) -> ApiResponse:
    """Handle get job status request.

    Returns:
        ApiResponse with job status, or error with status 404.
    """
    if state.backend_type == BackendType.cloud:
        job = cloud_manager.get_job(job_id)
        if not job:
            return ApiResponse(data={"error": "Job not found"}, status=404)

        # Map cloud-specific statuses to the plugin's existing status contract.
        # Plugin expects: queued | executing | finished | error | interrupted
        status_map = {
            CloudJobStatus.queued: "queued",
            CloudJobStatus.uploading: "queued",
            CloudJobStatus.in_queue: "queued",
            CloudJobStatus.in_progress: "executing",
            CloudJobStatus.finished: "finished",
            CloudJobStatus.error: "error",
            CloudJobStatus.cancelled: "interrupted",
            CloudJobStatus.timed_out: "error",
        }
        mapped_status = status_map.get(job.status, "error")

        return ApiResponse(data={
            "job_id": job_id,
            "status": mapped_status,
            "progress": job.progress,
            "error": job.error,
            "payment_required": asdict(job.payment_required) if job.payment_required else None,
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

    try:
        if params.refine:
            # Tiled diffusion refine after upscaling (Krita parity).
            import random
            import src.path_setup  # noqa: F401

            from shared.api import (
                WorkflowInput,
                WorkflowKind,
                ImageInput,
                ExtentInput,
                SamplingInput,
                ConditioningInput,
                CheckpointInput,
                LoraInput,
                UpscaleInput,
            )
            from shared.image import Image, Extent

            image_b64 = params.image
            if "," in image_b64:
                image_b64 = image_b64.split(",", 1)[1]
            try:
                image_bytes = base64.b64decode(image_b64)
            except Exception as e:
                return ApiResponse(data={"error": f"Invalid base64 image: {e}"}, status=400)

            image = Image.from_bytes(image_bytes)
            target_extent = image.extent * params.factor
            extent_input = ExtentInput(image.extent, target_extent, target_extent, target_extent)
            images = ImageInput(extent=extent_input, initial_image=image)

            seed = params.seed if params.seed >= 0 else random.randint(0, 2**31 - 1)
            total_steps = max(1, int(params.steps))
            denoise = float(params.strength)
            denoise = max(0.05, min(0.95, denoise))
            start_step = int(total_steps * (1 - denoise))

            sampling = SamplingInput(
                sampler=params.sampler,
                scheduler=params.scheduler,
                cfg_scale=float(params.cfg_scale),
                total_steps=total_steps,
                start_step=start_step,
                seed=seed,
            )

            prompt_clean, lora_tags = _parse_lora_tags(params.prompt or "")
            negative_clean, _ = _parse_lora_tags(params.negative_prompt or "")
            conditioning = ConditioningInput(positive=prompt_clean, negative=negative_clean)

            loras: list[LoraInput] = []
            for name, strength in lora_tags:
                loras.append(LoraInput(name=name, strength=strength))
            for entry in (params.loras or []):
                try:
                    name = str(entry.get("name", "")).strip()
                    if not name:
                        continue
                    strength = float(entry.get("strength", 1.0))
                    loras.append(LoraInput(name=name, strength=strength))
                except Exception:
                    continue

            if not params.checkpoint:
                return ApiResponse(data={"error": "checkpoint is required for refine upscaling"}, status=400)

            models = CheckpointInput(checkpoint=params.checkpoint, loras=loras)
            upscale = UpscaleInput(model=params.model or "", tile_overlap=int(params.tile_overlap))

            work = WorkflowInput(
                kind=WorkflowKind.upscale_tiled,
                images=images,
                models=models,
                sampling=sampling,
                conditioning=conditioning,
                upscale=upscale,
                batch_count=1,
            )

            if state.backend_type == BackendType.cloud:
                if not cloud_manager.is_connected:
                    return ApiResponse(
                        data={"error": "Not connected to cloud service"},
                        status=503
                    )
                job_id = await cloud_manager.enqueue(work)
                return ApiResponse(data={"job_id": job_id, "status": "queued"})

            manager = get_manager()
            if not manager.is_connected:
                return ApiResponse(
                    data={"error": "Not connected to ComfyUI"},
                    status=503
                )
            job_id = await manager.enqueue_workflow(work, batch_size=1, seed=seed)
            return ApiResponse(data={"job_id": job_id, "status": "queued"})

        if state.backend_type == BackendType.cloud:
            if not cloud_manager.is_connected:
                return ApiResponse(
                    data={"error": "Not connected to cloud service"},
                    status=503
                )

            # Decode base64 (strip data URL prefix if present)
            image_b64 = params.image
            if "," in image_b64:
                image_b64 = image_b64.split(",", 1)[1]

            try:
                image_bytes = base64.b64decode(image_b64)
            except Exception as e:
                return ApiResponse(data={"error": f"Invalid base64 image: {e}"}, status=400)

            # Reuse shared workflow constructors (krite-ai-diffusion parity).
            import src.path_setup  # noqa: F401
            from shared.image import Image
            from shared.workflow import prepare_upscale_simple

            image = Image.from_bytes(image_bytes)
            model_name = params.model or DEFAULT_UPSCALE_MODEL
            work = prepare_upscale_simple(image=image, model=model_name, factor=params.factor)
            job_id = await cloud_manager.enqueue(work)
            return ApiResponse(data={"job_id": job_id, "status": "queued"})

        manager = get_manager()

        if not manager.is_connected:
            return ApiResponse(
                data={"error": "Not connected to ComfyUI"},
                status=503
            )

        job_id = await manager.enqueue_upscale(
            image_base64=params.image,
            factor=params.factor,
            model=params.model,
        )
        return ApiResponse(data={"job_id": job_id, "status": "queued"})
    except Exception as e:
        return ApiResponse(data={"error": str(e)}, status=500)


async def handle_control_image(params: ControlImageParams) -> ApiResponse:
    """Handle control image preprocessing request."""
    try:
        import src.path_setup  # noqa: F401
        import base64 as _b64

        from shared.api import WorkflowKind
        from shared.image import Image, Bounds
        from shared.resources import ControlMode
        from shared.settings import PerformanceSettings
        from shared.workflow import prepare_create_control_image

        mode_raw = str(params.mode or "").strip().lower()
        if mode_raw not in ControlMode.__members__:
            return ApiResponse(data={"error": f"Unknown control mode: {params.mode}"}, status=400)

        image_b64 = params.image
        if "," in image_b64:
            image_b64 = image_b64.split(",", 1)[1]
        image_bytes = _b64.b64decode(image_b64)
        image = Image.from_bytes(image_bytes)

        perf_settings = PerformanceSettings()
        perf_override = params.performance or {}
        if isinstance(perf_override, dict):
            try:
                max_pixels = perf_override.get("max_pixels")
                resolution_multiplier = perf_override.get("resolution_multiplier")
                if max_pixels is not None:
                    perf_settings.max_pixel_count = max(0.0, float(max_pixels)) / 1_000_000
                if resolution_multiplier is not None:
                    perf_settings.resolution_multiplier = float(resolution_multiplier)
            except Exception:
                pass

        bounds = None
        bounds_data = params.bounds
        if isinstance(bounds_data, dict):
            try:
                bounds = Bounds(
                    int(bounds_data.get("x", 0)),
                    int(bounds_data.get("y", 0)),
                    int(bounds_data.get("width", image.width)),
                    int(bounds_data.get("height", image.height)),
                )
            except Exception:
                bounds = None

        work = prepare_create_control_image(
            image=image,
            mode=ControlMode[mode_raw],
            performance_settings=perf_settings,
            bounds=bounds,
            seed=params.seed,
        )

        if state.backend_type == BackendType.cloud:
            if not cloud_manager.is_connected:
                return ApiResponse(data={"error": "Not connected to cloud service"}, status=503)
            job_id = await cloud_manager.enqueue(work)
        else:
            manager = get_manager()
            if not manager.is_connected:
                return ApiResponse(data={"error": "Not connected to ComfyUI"}, status=503)
            job_id = await manager.enqueue_workflow(work, batch_size=1, seed=params.seed)

        images_response = await handle_get_job_images(job_id)
        if images_response.status != 200:
            return images_response
        images = images_response.data.get("images", [])
        if not images:
            return ApiResponse(data={"error": "No images generated"}, status=500)
        return ApiResponse(data={"image": images[0], "kind": WorkflowKind.control_image.name})
    except Exception as e:
        return ApiResponse(data={"error": str(e)}, status=500)


async def handle_custom_workflow(workflow: dict) -> ApiResponse:
    """Execute a user-supplied custom ComfyUI workflow graph (local backend only)."""
    if state.backend_type == BackendType.cloud:
        return ApiResponse(
            data={"error": "Custom workflows are not supported for cloud backend"},
            status=400,
        )

    manager = get_manager()
    if not manager.is_connected:
        return ApiResponse(
            data={"error": "Not connected to ComfyUI"},
            status=503,
        )

    try:
        if not isinstance(workflow, dict) or not workflow:
            return ApiResponse(data={"error": "workflow must be a non-empty object"}, status=400)
        job_id = await manager.enqueue_raw_prompt(workflow)
        return ApiResponse(data={"job_id": job_id, "status": "queued"})
    except Exception as e:
        return ApiResponse(data={"error": str(e)}, status=500)
