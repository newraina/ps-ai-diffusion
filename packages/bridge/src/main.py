from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional
from src.state import state, BackendType
from src.comfy import connect_to_comfy

app = FastAPI(title="PS AI Bridge", version="0.1.0")


class ConnectionRequest(BaseModel):
    backend: str = "local"
    comfy_url: Optional[str] = "http://localhost:8188"


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
        await connect_to_comfy(request.comfy_url)
    else:
        state.backend_type = BackendType.cloud
        # Cloud connection to be implemented later

    return {
        "status": state.connection_status.value,
        "backend": state.backend_type.value,
        "comfy_url": state.comfy_url,
        "error": state.error_message,
    }
