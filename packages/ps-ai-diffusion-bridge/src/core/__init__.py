"""Core module containing framework-agnostic business logic."""
from .state import state, ConnectionStatus, BackendType, AppState
from .comfy_client_manager import (
    ComfyClientManager,
    get_manager,
    JobStatus,
    JobState,
    build_txt2img_workflow,
    build_img2img_workflow,
)
from .handlers import (
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
)

__all__ = [
    # State
    "state",
    "ConnectionStatus",
    "BackendType",
    "AppState",
    # Manager
    "ComfyClientManager",
    "get_manager",
    "JobStatus",
    "JobState",
    "build_txt2img_workflow",
    "build_img2img_workflow",
    # Handlers
    "ApiResponse",
    "GenerateParams",
    "handle_health",
    "handle_get_connection",
    "handle_post_connection",
    "handle_generate",
    "handle_get_job",
    "handle_get_job_images",
    "handle_get_job_image",
    "handle_cancel_job",
]
