from pydantic import BaseModel
from typing import Optional
import uuid


class GenerateRequest(BaseModel):
    prompt: str
    negative_prompt: str = ""
    width: int = 512
    height: int = 512
    steps: int = 20
    cfg_scale: float = 7.0
    seed: int = -1
    model: str = ""
    image: Optional[str] = None  # Base64 encoded
    mask: Optional[str] = None   # Base64 encoded


class GenerateResponse(BaseModel):
    job_id: str
    status: str = "queued"

    @staticmethod
    def create():
        return GenerateResponse(job_id=str(uuid.uuid4()))
