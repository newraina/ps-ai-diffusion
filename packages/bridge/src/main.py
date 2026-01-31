import os
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional
from src.state import state, BackendType
from src.comfy import connect_to_comfy
from src.models import GenerateRequest, GenerateResponse

app = FastAPI(title="PS AI Bridge", version="0.1.0")

DEFAULT_COMFY_URL = "http://localhost:8188"


def get_comfy_url(request_url: Optional[str]) -> str:
    """Get ComfyUI URL with fallback to env var and default."""
    if request_url:
        return request_url
    return os.getenv("COMFY_URL", DEFAULT_COMFY_URL)


class ConnectionRequest(BaseModel):
    backend: str = "local"
    comfy_url: Optional[str] = None
    auth_token: Optional[str] = None


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/connection")
async def get_connection():
    return {
        "status": state.connection_status.value,
        "backend": state.backend_type.value,
        "comfy_url": state.comfy_url,
        "error": state.error_message,
    }


@app.post("/api/connection")
async def post_connection(request: ConnectionRequest):
    if request.backend == "local":
        state.backend_type = BackendType.local
        url = get_comfy_url(request.comfy_url)
        await connect_to_comfy(url, request.auth_token)
    else:
        state.backend_type = BackendType.cloud
        # Cloud connection to be implemented later

    return {
        "status": state.connection_status.value,
        "backend": state.backend_type.value,
        "comfy_url": state.comfy_url,
        "error": state.error_message,
    }


@app.post("/api/generate")
async def generate(request: GenerateRequest):
    # For now, just return a job ID
    # Actual generation will be implemented in next task
    response = GenerateResponse.create()
    return response.model_dump()
