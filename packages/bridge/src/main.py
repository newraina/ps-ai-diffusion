from fastapi import FastAPI
from src.state import state

app = FastAPI(title="PS AI Bridge", version="0.1.0")


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
